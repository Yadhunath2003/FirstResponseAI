"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import { useIncidentVoice } from "@/lib/use-incident-voice";
import { startPTT, type PTTHandle } from "@/lib/audio";
import type { WSMessage, ChannelId, Communication } from "@/lib/types";
import { IncidentMap } from "@/components/incident-map";
import { ChannelMicTile, type TileState } from "@/components/channel-mic-tile";
import {
  FR,
  SolidSquare,
  FrLabel,
  StatusBadge,
} from "@/components/fr/atoms";
import { ArrowLeft, Radio, FileText, Map as MapIcon } from "lucide-react";
import { toast } from "sonner";

const CHANNELS: { id: ChannelId; label: string; desc: string; color: string }[] = [
  { id: "command", label: "Command", desc: "IC orders, accountability", color: FR.red },
  { id: "triage", label: "Triage", desc: "Patient status, medical", color: FR.orange },
  { id: "logistics", label: "Logistics", desc: "Equipment, staging", color: FR.green },
  { id: "comms", label: "Comms", desc: "General radio traffic", color: FR.blue },
];

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

type Tab = "ptt" | "intel" | "map";

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
  const [tab, setTab] = useState<Tab>("ptt");

  const handleRef = useRef<PTTHandle | null>(null);
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
          toast.warning(
            `Conflict: ${(msg as { description?: string }).description ?? ""}`,
          );
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
        api
          .postVoice({
            channelId: channel,
            transcript: result.transcript,
            unitId,
            incidentId,
            audioBlob: result.blob,
            audioFilename: `${Date.now()}.${result.extension}`,
          })
          .then(() =>
            qc.invalidateQueries({ queryKey: ["timeline", incidentId] }),
          )
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
        voice.transmit(true);
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
      <div
        className="min-h-[100dvh] p-5"
        style={{ background: FR.bg }}
      >
        <p className="text-[13px]" style={{ color: FR.text }}>
          Not registered.{" "}
          <a className="underline" style={{ color: FR.red }} href="/responder/register">
            Register first.
          </a>
        </p>
      </div>
    );
  }

  const wsConnected = wsStatus === "open";

  return (
    <div
      className="flex flex-col h-[100dvh] overflow-hidden"
      style={{ background: FR.bg }}
    >
      {/* Header */}
      <header
        className="flex items-stretch shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <Link
          href="/responder/incidents"
          className="flex items-center px-4 py-3 transition-colors"
          style={{ borderRight: `1px solid ${FR.border}`, color: FR.sub }}
          onMouseEnter={(e) => (e.currentTarget.style.color = FR.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = FR.sub)}
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0 px-3 py-2.5">
          <div className="text-[13px] font-semibold text-white leading-tight truncate">
            {incident.data?.name ?? "Incident"}
          </div>
          <div
            className="font-mono text-[10px] mt-0.5 truncate"
            style={{ color: FR.sub }}
          >
            {callsign} · {incident.data?.location_name ?? ""}
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-3"
          style={{ borderLeft: `1px solid ${FR.border}` }}
        >
          <div className="flex items-center gap-1">
            <SolidSquare
              color={voice.peerCount > 0 ? FR.green : FR.dim}
              size={6}
              style={{ borderRadius: "50%" }}
              className={voice.peerCount > 0 ? "fr-conn-live" : ""}
            />
            <span className="font-mono text-[10px]" style={{ color: FR.sub }}>
              {voice.peerCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <SolidSquare
              color={wsConnected ? FR.green : FR.red}
              size={6}
              style={{ borderRadius: "50%" }}
              className={wsConnected ? "fr-conn-live" : ""}
            />
            <span className="font-mono text-[10px]" style={{ color: FR.sub }}>
              WS
            </span>
          </div>
        </div>
      </header>

      {/* PTT tab */}
      {tab === "ptt" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="px-4 py-2 flex items-center justify-between shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <FrLabel>CHANNELS</FrLabel>
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: FR.sub }}
            >
              BROADCAST:{" "}
              <span style={{ color: FR.text }}>
                {broadcastChannel.toUpperCase()}
              </span>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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

            <p
              className="mt-4 text-center text-[10px] font-mono tracking-[0.06em]"
              style={{ color: FR.dim }}
            >
              TAP A CHANNEL TO TALK LIVE · TAP AGAIN TO STOP
              {!voice.micReady && " · WAITING FOR MIC…"}
            </p>
            {interim && (
              <div
                className="mt-3 p-2.5 italic"
                style={{
                  background: FR.card,
                  border: `1px solid ${FR.border}`,
                }}
              >
                <span
                  className="font-mono text-[11px]"
                  style={{ color: FR.sub }}
                >
                  &ldquo;{interim}&rdquo;
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Intel tab */}
      {tab === "intel" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="p-4 shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <FrLabel className="block mb-2">INCIDENT SUMMARY</FrLabel>
            <div
              className="p-3 text-[12px] leading-relaxed max-h-[180px] overflow-y-auto"
              style={{
                background: FR.card,
                border: `1px solid ${FR.border}`,
                color: "#bbb",
              }}
            >
              {incident.data?.summary ||
                "Awaiting communications to generate summary…"}
            </div>
          </div>

          <div
            className="px-4 py-2 shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <FrLabel>TIMELINE</FrLabel>
          </div>

          <div className="flex-1 overflow-y-auto">
            {(timeline.data ?? []).length === 0 && (
              <p
                className="text-center text-[11px] p-6"
                style={{ color: FR.dim }}
              >
                Waiting for communications…
              </p>
            )}
            {timeline.data?.map((c) => (
              <TimelineEntry key={c.id} comm={c} />
            ))}
          </div>
        </div>
      )}

      {/* Map tab */}
      {tab === "map" && (
        <div className="flex-1 overflow-hidden">
          <IncidentMap center={center} zones={zones.data ?? []} interactive />
        </div>
      )}

      {/* Bottom tab bar */}
      <footer
        className="flex items-stretch shrink-0"
        style={{ borderTop: `1px solid ${FR.border}` }}
      >
        <TabButton
          Icon={Radio}
          label="PTT"
          active={tab === "ptt"}
          onClick={() => setTab("ptt")}
        />
        <TabButton
          Icon={FileText}
          label="INTEL"
          active={tab === "intel"}
          onClick={() => setTab("intel")}
        />
        <TabButton
          Icon={MapIcon}
          label="MAP"
          active={tab === "map"}
          onClick={() => setTab("map")}
        />
      </footer>

      {/* Status strip */}
      <div
        className="flex items-center justify-between px-4 py-1.5 shrink-0"
        style={{ borderTop: `1px solid ${FR.border}`, background: FR.panel }}
      >
        <span
          className="font-mono text-[10px]"
          style={{ color: FR.dim }}
        >
          {timeline.data?.length ?? 0} COMMS
          {zones.data && zones.data.length > 0 && ` · ${zones.data.length} ZONES`}
        </span>
        {incident.data?.status && <StatusBadge status={incident.data.status} />}
      </div>
    </div>
  );
}

function TabButton({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
      style={{
        background: "transparent",
        borderTop: `2px solid ${active ? FR.blue : "transparent"}`,
        color: active ? FR.text : FR.sub,
      }}
    >
      <Icon size={16} strokeWidth={1.8} style={{ color: active ? FR.blue : FR.sub }} />
      <span
        className="font-mono text-[9px] font-semibold tracking-[0.1em]"
      >
        {label}
      </span>
    </button>
  );
}

function TimelineEntry({ comm }: { comm: Communication }) {
  const channelColors: Record<string, string> = {
    command: FR.red,
    triage: FR.orange,
    logistics: FR.green,
    comms: FR.blue,
  };
  const color = channelColors[comm.channel_id] || FR.sub;
  const time = new Date(comm.timestamp).toLocaleTimeString("en", {
    hour12: false,
  });

  return (
    <div
      className="px-4 py-2.5 flex gap-2.5 fr-entry-new"
      style={{ borderBottom: `1px solid ${FR.border}` }}
    >
      <div
        className="w-0.5 shrink-0 self-stretch"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span
            className="font-mono text-[11px] font-bold"
            style={{ color: FR.text }}
          >
            {comm.unit_callsign}
          </span>
          <span
            className="font-mono text-[9px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5"
            style={{
              background: color + "22",
              border: `1px solid ${color}44`,
              color,
            }}
          >
            {comm.channel_id}
          </span>
          <span
            className="ml-auto font-mono text-[10px]"
            style={{ color: FR.dim }}
          >
            {time}
          </span>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: "#ccc" }}>
          {comm.transcript}
        </p>
      </div>
    </div>
  );
}