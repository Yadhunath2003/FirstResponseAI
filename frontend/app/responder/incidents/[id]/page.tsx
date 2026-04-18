"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import { useIncidentVoice } from "@/lib/use-incident-voice";
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

export default function ResponderIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: incidentId } = use(params);
  const qc = useQueryClient();
  const { unitId, callsign, unitType } = useSession();

  const initialChannel = useMemo(() => defaultChannelFor(unitType), [unitType]);
  const [broadcastChannel, setBroadcastChannel] = useState<ChannelId>(initialChannel);
  const [talkingChannel, setTalkingChannel] = useState<ChannelId | null>(null);
  const [micState, setMicState] = useState<TileState>("idle");
  const [interim, setInterim] = useState("");

  const handleRef = useRef<PTTHandle | null>(null);

  // Socket send() is wired below; the voice hook gets a stable send via ref.
  const sendRef = useRef<(msg: object) => boolean>(() => false);
  const voice = useIncidentVoice({
    unitId,
    send: (msg) => sendRef.current(msg),
    enabled: true,
    receiveOnly: false,
  });

  const voiceRef = useRef(voice);
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      voiceRef.current.onWsMessage(msg);
      switch (msg.type) {
        case "audio":
          // Live audio already played via WebRTC mesh. Just refresh the
          // timeline so the transcript/clip shows up.
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

  const { status: wsStatus, send } = useIncidentSocket({
    incidentId,
    unitId,
    onMessage: handleMessage,
  });
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

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

  const stopTalking = useCallback(
    async (channel: ChannelId) => {
      voice.transmit(false);
      const h = handleRef.current;
      if (!h || !unitId) {
        setMicState("idle");
        setTalkingChannel(null);
        return;
      }
      handleRef.current = null;
      setMicState("sending");
      try {
        const result = await h.stop();
        // Background upload — don't block UI on network.
        api
          .postVoice({
            channelId: channel,
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
      } finally {
        setInterim("");
        setTalkingChannel(null);
        setMicState("idle");
      }
    },
    [unitId, incidentId, qc, voice],
  );

  const startTalking = useCallback(
    async (channel: ChannelId) => {
      const stream = voice.getMicStream();
      if (!stream) {
        toast.error("Microphone not ready yet");
        return;
      }
      setMicState("starting");
      setTalkingChannel(channel);
      try {
        // Live audio begins the moment we unmute the outbound track.
        voice.transmit(true);
        // In parallel: capture for storage/transcript/AI.
        handleRef.current = await startPTT({ onInterim: setInterim, stream });
        setMicState("recording");
      } catch (err) {
        voice.transmit(false);
        const m = err instanceof Error ? err.message : String(err);
        toast.error(`Microphone error: ${m}`);
        handleRef.current = null;
        setTalkingChannel(null);
        setMicState("idle");
      }
    },
    [voice],
  );

  const onTileTap = useCallback(
    async (channel: ChannelId) => {
      voice.unlockAudio();
      if (micState === "starting" || micState === "sending") return;
      setBroadcastChannel(channel);

      if (talkingChannel === channel) {
        await stopTalking(channel);
        return;
      }
      if (talkingChannel && talkingChannel !== channel) {
        const prev = talkingChannel;
        await stopTalking(prev);
        await startTalking(channel);
        return;
      }
      await startTalking(channel);
    },
    [micState, talkingChannel, stopTalking, startTalking, voice],
  );

  useEffect(() => {
    return () => {
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

  if (!unitId) {
    return (
      <div className="p-4 text-sm">Not registered. <a className="underline" href="/responder/register">Register first.</a></div>
    );
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <header className="p-3 border-b flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{incident.data?.name ?? "Incident"}</h1>
          <p className="text-[10px] text-muted-foreground truncate">
            {callsign} · {incident.data?.location_name ?? ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {voice.peerCount} live
          </Badge>
          <ConnectionBadge status={wsStatus} />
        </div>
      </header>

      <Tabs defaultValue="cards" className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-4 rounded-none border-b">
          <TabsTrigger value="cards">PTT</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="cards" className="flex-1 p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Channels</CardTitle>
              <span className="text-[10px] text-muted-foreground">
                Broadcast on: <span className="font-medium">{broadcastChannel}</span>
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map((c) => (
                  <ChannelMicTile
                    key={c.id}
                    label={c.label}
                    desc={c.desc}
                    isTuned={broadcastChannel === c.id}
                    state={talkingChannel === c.id ? micState : "idle"}
                    unread={0}
                    disabled={
                      !voice.micReady ||
                      micState === "starting" ||
                      micState === "sending"
                    }
                    onTap={() => onTileTap(c.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-[10px] text-muted-foreground text-center">
            Tap a channel to start talking live. Tap again to stop.{" "}
            {voice.micReady ? "" : "Waiting for mic…"}
          </p>
          {interim && (
            <p className="text-xs text-center text-muted-foreground italic">
              “{interim}”
            </p>
          )}
        </TabsContent>

        <TabsContent value="summary" className="flex-1 p-4">
          <SummaryPanel summary={incident.data?.summary ?? ""} />
        </TabsContent>

        <TabsContent value="map" className="flex-1 p-0">
          <div className="h-[calc(100dvh-130px)]">
            <IncidentMap center={center} zones={zones.data ?? []} interactive />
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Timeline comms={timeline.data ?? []} />
          </div>
        </TabsContent>
      </Tabs>

      <footer className="border-t p-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {timeline.data?.length ?? 0} comms
          {zones.data && zones.data.length > 0 && ` · ${zones.data.length} zones`}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {incident.data?.status ?? "—"}
        </Badge>
      </footer>
    </div>
  );
}
