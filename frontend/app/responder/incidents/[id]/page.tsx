"use client";

import { use, useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import type { WSMessage, ChannelId } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/timeline";
import { SummaryPanel } from "@/components/summary-panel";
import { PTTButton } from "@/components/ptt-button";
import { IncidentMap } from "@/components/incident-map";
import { ConnectionBadge } from "@/components/connection-badge";
import { toast } from "sonner";

const CHANNELS: { id: ChannelId; label: string; desc: string }[] = [
  { id: "command", label: "Command", desc: "IC orders, accountability" },
  { id: "triage", label: "Triage", desc: "Patient status, medical" },
  { id: "logistics", label: "Logistics", desc: "Equipment, staging" },
  { id: "comms", label: "Comms", desc: "General radio traffic" },
];

export default function ResponderIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: incidentId } = use(params);
  const qc = useQueryClient();
  const { unitId, callsign } = useSession();

  const [channel, setChannel] = useState<ChannelId>("command");
  const [interim, setInterim] = useState("");

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

  const onPTTResult = useCallback(
    async ({ blob, transcript, extension }: { blob: Blob; transcript: string; extension: string }) => {
      if (!unitId) return;
      await api.postVoice({
        channelId: channel,
        transcript,
        unitId,
        incidentId,
        audioBlob: blob,
        audioFilename: `${Date.now()}.${extension}`,
      });
      setInterim("");
      qc.invalidateQueries({ queryKey: ["timeline", incidentId] });
    },
    [unitId, channel, incidentId, qc],
  );

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
        <ConnectionBadge status={wsStatus} />
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    variant={channel === c.id ? "default" : "outline"}
                    size="sm"
                    className="flex-col h-auto py-2"
                    onClick={() => setChannel(c.id)}
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="text-[9px] opacity-70">{c.desc}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col items-center gap-3 py-6">
            <PTTButton
              onResult={onPTTResult}
              onInterim={setInterim}
              label={`Hold · ${channel}`}
            />
            {interim && (
              <p className="text-xs text-center text-muted-foreground italic max-w-xs">
                “{interim}”
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Push and hold. Release to send.
            </p>
          </div>
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
