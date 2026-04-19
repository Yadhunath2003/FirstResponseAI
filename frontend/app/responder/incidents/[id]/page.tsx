"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import { useChannelRoom } from "@/lib/use-channel-room";
import { startPTT, type PTTHandle } from "@/lib/audio";
import type { WSMessage, ChannelId } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/timeline";
import { SummaryPanel } from "@/components/summary-panel";
import { IncidentMap } from "@/components/incident-map";
import { ConnectionBadge } from "@/components/connection-badge";
import { ChannelMicTile, type TileState } from "@/components/channel-mic-tile";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const CHANNELS: { id: ChannelId; label: string; desc: string }[] = [
  { id: "command", label: "Command", desc: "IC orders, accountability" },
  { id: "triage", label: "Triage", desc: "Patient status, medical" },
  { id: "logistics", label: "Logistics", desc: "Equipment, staging" },
  { id: "comms", label: "Comms", desc: "General radio traffic" },
];

// Which channel a unit defaults to broadcasting on.
function defaultChannelFor(unitType: string | null): ChannelId {
  switch (unitType) {
    case "command":
    case "battalion_chief":
    case "division":
    case "safety":
      return "command";
    case "medic":
      return "triage";
    case "staging":
      return "logistics";
    case "engine":
    case "ladder":
    default:
      return "comms";
  }
}

// Max time a responder can hold the mic open before auto-release. Guards
// against stuck PTT that would jam the talkgroup.
const STUCK_MIC_MS = 30_000;

export default function ResponderIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: incidentId } = use(params);
  const qc = useQueryClient();
  const { unitId, callsign, unitType } = useSession();

  const initialChannel = useMemo(() => defaultChannelFor(unitType), [unitType]);
  // tunedChannel = the talkgroup we're listening on and will transmit into.
  const [tunedChannel, setTunedChannel] = useState<ChannelId>(initialChannel);
  const [keyed, setKeyed] = useState(false);
  const [micState, setMicState] = useState<TileState>("idle");
  const [interim, setInterim] = useState("");

  const handleRef = useRef<PTTHandle | null>(null);
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One LiveKit room per tuned channel. Changing tunedChannel drives a
  // disconnect+reconnect under the hood (~few hundred ms blip — acceptable
  // for a responder switching talkgroups).
  const room = useChannelRoom({
    incidentId,
    channelId: tunedChannel,
    unitId,
    callsign,
    enabled: true,
    canPublish: true,
  });

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      switch (msg.type) {
        case "audio":
          qc.invalidateQueries({ queryKey: ["timeline", incidentId] });
          break;
        case "summary_update":
          qc.invalidateQueries({ queryKey: ["incident", incidentId] });
          break;
        case "zone_update":
        case "zones_refresh":
          qc.invalidateQueries({ queryKey: ["zones", incidentId] });
          break;
        case "dispatched":
          toast.info(`Dispatched to ${msg.incident_name ?? "an incident"}`);
          break;
        case "conflict":
          toast.warning(`Conflict: ${(msg as { description?: string }).description ?? ""}`);
          break;
      }
    },
    [qc, incidentId],
  );

  const { status: wsStatus } = useIncidentSocket({
    incidentId,
    unitId,
    onMessage: handleMessage,
  });

  const incident = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => api.getIncident(incidentId),
    refetchInterval: 15_000,
  });

  const timeline = useQuery({
    queryKey: ["timeline", incidentId],
    queryFn: () => api.getTimeline(incidentId),
    refetchInterval: 10_000,
  });

  const zones = useQuery({
    queryKey: ["zones", incidentId],
    queryFn: () => api.getZones(incidentId),
    refetchInterval: 15_000,
  });

  const stopTalking = useCallback(async () => {
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }
    await room.setMicEnabled(false);
    setKeyed(false);

    const h = handleRef.current;
    handleRef.current = null;
    if (!h || !unitId) {
      setMicState("idle");
      setInterim("");
      return;
    }

    // Keep the UI responsive: background the upload and let the operator
    // re-key the mic immediately.
    setMicState("idle");
    setInterim("");
    try {
      const result = await h.stop();
      api
        .postVoice({
          channelId: tunedChannel,
          transcript: result.transcript,
          unitId,
          incidentId,
          audioBlob: result.blob,
          audioFilename: `${Date.now()}.${result.extension}`,
        })
        .then(() => qc.invalidateQueries({ queryKey: ["timeline", incidentId] }))
        .catch((err) =>
          toast.error(err instanceof Error ? err.message : "Voice send failed"),
        );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice send failed");
    }
  }, [room, unitId, incidentId, tunedChannel, qc]);

  const startTalking = useCallback(async () => {
    if (!room.connected) {
      toast.error("Channel not connected yet");
      return;
    }
    setMicState("starting");
    try {
      await room.setMicEnabled(true);
      setKeyed(true);

      // Reuse LiveKit's mic track for the transcript recorder so we don't
      // prompt for permission a second time or fight for the device.
      const stream = room.getLocalStream();
      handleRef.current = await startPTT({
        onInterim: setInterim,
        stream: stream ?? undefined,
      });
      setMicState("recording");

      // Stuck-mic guard.
      stuckTimerRef.current = setTimeout(() => {
        toast.warning("Mic auto-released (30s limit)");
        stopTalking();
      }, STUCK_MIC_MS);
    } catch (err) {
      await room.setMicEnabled(false).catch(() => {});
      setKeyed(false);
      const m = err instanceof Error ? err.message : String(err);
      toast.error(`Microphone error: ${m}`);
      handleRef.current = null;
      setMicState("idle");
    }
  }, [room, stopTalking]);

  const onTileTap = useCallback(
    async (channel: ChannelId) => {
      if (micState === "starting") return;

      // Tapping a different channel tunes to it. If currently keyed, release
      // the mic first so we don't transmit into the wrong talkgroup during
      // the reconnect window.
      if (channel !== tunedChannel) {
        if (keyed) await stopTalking();
        setTunedChannel(channel);
        return;
      }
      // Same channel tapped: toggle transmit.
      if (keyed) await stopTalking();
      else await startTalking();
    },
    [micState, tunedChannel, keyed, stopTalking, startTalking],
  );

  useEffect(() => {
    return () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      handleRef.current?.stop().catch(() => {});
      handleRef.current = null;
    };
  }, []);

  const center = useMemo<[number, number]>(
    () => [
      incident.data?.location_lat || 38.9592,
      incident.data?.location_lng || -95.2453,
    ],
    [incident.data],
  );

  // Who (if anyone) is currently keyed on our tuned channel, for the busy UI.
  const activeTalker = useMemo(() => {
    if (!room.speakers.length) return null;
    // Prefer a remote speaker label; skip ourselves.
    const remote = room.speakers.find((id) => id !== unitId);
    return remote ?? null;
  }, [room.speakers, unitId]);

  if (!unitId) {
    return (
      <div className="p-4 text-sm">Not registered. <a className="underline" href="/responder/register">Register first.</a></div>
    );
  }

  return (
    <div className="flex flex-col h-dvh w-full max-w-full overflow-x-hidden">
      <header className="border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <Link href="/responder/incidents" className="shrink-0">
            <Button variant="ghost" size="icon" aria-label="Back" className="size-8 -ml-1">
              <ChevronLeft className="size-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold truncate leading-tight">{incident.data?.name ?? "Incident"}</h1>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {callsign} · {incident.data?.location_name ?? ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="outline" className="text-[11px] px-2">
            {room.participantCount} · {tunedChannel}
          </Badge>
          <ConnectionBadge status={wsStatus} />
        </div>
      </header>

      <Tabs defaultValue="cards" className="flex-1 flex flex-col min-h-0 w-full gap-0">
        <TabsList className="w-full grid grid-cols-3 rounded-none border-b h-11 shrink-0">
          <TabsTrigger value="cards" className="text-sm">PTT</TabsTrigger>
          <TabsTrigger value="intel" className="text-sm">Intel</TabsTrigger>
          <TabsTrigger value="map" className="text-sm">Map</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 m-0">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm">Channels</CardTitle>
              <span className="text-[11px] text-muted-foreground truncate">
                Tuned: <span className="font-medium text-foreground">{tunedChannel}</span>
                {!room.connected && " · connecting…"}
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map((c) => (
                  <ChannelMicTile
                    key={c.id}
                    label={c.label}
                    desc={c.desc}
                    isTuned={tunedChannel === c.id}
                    state={tunedChannel === c.id && keyed ? micState : "idle"}
                    unread={0}
                    disabled={micState === "starting"}
                    onTap={() => onTileTap(c.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground text-center px-4 leading-relaxed">
            Tap another channel to tune in. Tap your tuned channel to key the mic.
          </p>
          {activeTalker && !keyed && (
            <p className="text-sm text-center text-destructive font-medium">
              ● {activeTalker} on air
            </p>
          )}
          {interim && (
            <p className="text-sm text-center text-muted-foreground italic px-4">
              “{interim}”
            </p>
          )}
        </TabsContent>

        <TabsContent value="intel" className="flex-1 min-h-0 overflow-hidden flex flex-col m-0">
          <div className="p-3 border-b shrink-0">
            <SummaryPanel summary={incident.data?.summary ?? ""} initialSummary={incident.data?.initial_summary} />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Timeline comms={timeline.data ?? []} />
          </div>
        </TabsContent>

        <TabsContent value="map" className="flex-1 min-h-0 overflow-hidden m-0">
          <IncidentMap center={center} zones={zones.data ?? []} interactive />
        </TabsContent>
      </Tabs>

      <footer className="border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
        <span className="truncate">
          {timeline.data?.length ?? 0} comms
          {zones.data && zones.data.length > 0 && ` · ${zones.data.length} zones`}
        </span>
        <Badge variant="outline" className="text-[11px]">
          {incident.data?.status ?? "—"}
        </Badge>
      </footer>
    </div>
  );
}
