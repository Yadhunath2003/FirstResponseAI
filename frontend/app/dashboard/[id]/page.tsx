"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import { useIncidentVoice } from "@/lib/use-incident-voice";
import type { WSMessage } from "@/lib/types";
import { IncidentMap } from "@/components/incident-map";
import {
  FR,
  SolidSquare,
  TypeBadge,
  StatusBadge,
  FrLabel,
  TYPE_META,
} from "@/components/fr/atoms";
import {
  ArrowLeft,
  Search,
  Sparkles,
  Users,
  Radio,
  Volume2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

export default function DashboardIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const { id: incidentId } = use(params);
  const qc = useQueryClient();
  const { deviceId } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState <
    import("@/lib/types").Communication[] | null
  >(null);

  const incident = useQuery({
    queryKey: ["incident", incidentId],
    queryFn: () => api.getIncident(incidentId),
    refetchInterval: 10_000,
  });

  const timeline = useQuery({
    queryKey: ["timeline", incidentId],
    queryFn: () => api.getTimeline(incidentId),
    refetchInterval: 8_000,
  });

  const zones = useQuery({
    queryKey: ["zones", incidentId],
    queryFn: () => api.getZones(incidentId),
    refetchInterval: 12_000,
  });

  const suggestions = useQuery({
    queryKey: ["suggestions", incidentId],
    queryFn: () => api.getSuggestions(incidentId),
    refetchInterval: 10_000,
  });

  const operatorUnitId = useMemo(
    () => `operator-${deviceId.slice(0, 8)}`,
    [deviceId],
  );

  const sendRef = useRef<(msg: object) => boolean>(() => false);
  const voice = useIncidentVoice({
    unitId: operatorUnitId,
    send: (msg) => sendRef.current(msg),
    enabled: true,
    receiveOnly: true,
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
        case "zone_suggestion":
          qc.invalidateQueries({ queryKey: ["suggestions", incidentId] });
          toast.info("New AI zone suggestion");
          break;
        case "unit_joined":
          qc.invalidateQueries({ queryKey: ["incident", incidentId] });
          toast.success(
            `${(msg as { unit_callsign?: string }).unit_callsign} joined`,
          );
          break;
        case "conflict":
          toast.warning(
            `Conflict: ${(msg as { description?: string }).description}`,
          );
          break;
      }
    },
    [qc, incidentId],
  );

  const { status: wsStatus, send } = useIncidentSocket({
    incidentId,
    unitId: operatorUnitId,
    onMessage: handleMessage,
  });
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const resolve = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) =>
      api.resolveSuggestion(incidentId, id, action, {
        resolved_by: "operator",
        lat: incident.data?.location_lat,
        lng: incident.data?.location_lng,
        radius: 500,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions", incidentId] });
      qc.invalidateQueries({ queryKey: ["zones", incidentId] });
    },
  });

  const search = useMutation({
    mutationFn: () => api.searchHistory(incidentId, searchQuery),
    onSuccess: (results) => setSearchResults(results),
    onError: (e) => toast.error(e.message),
  });

  const center = useMemo<[number, number]>(
    () => [
      incident.data?.location_lat || 38.9592,
      incident.data?.location_lng || -95.2453,
    ],
    [incident.data],
  );

  const comms = searchResults ?? timeline.data ?? [];
  const wsConnected = wsStatus === "open";

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: FR.bg }}
    >
      {/* Header */}
      <header
        className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center px-1 py-1 transition-colors"
            style={{ color: FR.sub }}
            onMouseEnter={(e) => (e.currentTarget.style.color = FR.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = FR.sub)}
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight text-white truncate">
              {incident.data?.name ?? "Incident"}
            </h1>
            <p
              className="text-[11px] truncate"
              style={{ color: FR.sub }}
            >
              {incident.data?.location_name ?? ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={voice.unlockAudio}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={{
              background: FR.card,
              border: `1px solid ${FR.border}`,
              color: FR.sub,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = FR.borderStrong;
              e.currentTarget.style.color = FR.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = FR.border;
              e.currentTarget.style.color = FR.sub;
            }}
            title="Enable live audio"
          >
            <Volume2 size={12} />
            Live ({voice.peerCount})
          </button>
          {incident.data?.incident_type && (
            <TypeBadge type={incident.data.incident_type} />
          )}
          {incident.data?.status && <StatusBadge status={incident.data.status} />}
          <DispatchButton
            incidentName={incident.data?.name ?? "Incident"}
            units={incident.data?.units ?? []}
            onOpenChange={setDispatchOpen}
          />
          <div className="flex items-center gap-1.5">
            <SolidSquare
              color={wsConnected ? FR.green : FR.red}
              size={7}
              className={wsConnected ? "fr-conn-live" : ""}
              style={{ borderRadius: "50%" }}
            />
            <span
              className="font-mono text-[10px] tracking-[0.06em] hidden sm:inline"
              style={{ color: FR.sub }}
            >
              WS
            </span>
          </div>
        </div>
      </header>

      {/* Body — 3 columns */}
      <div
        className="flex-1 grid overflow-hidden min-h-0"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 340px 380px" }}
      >
        {/* LEFT — Map */}
        <section
          className="relative overflow-hidden"
          style={{ borderRight: `1px solid ${FR.border}` }}
        >
          {!dispatchOpen && (
            <IncidentMap center={center} zones={zones.data ?? []} />
          )}
          {/* Zone legend overlay */}
          <div
            className="absolute bottom-4 left-4 z-[500] p-2.5"
            style={{
              background: FR.panel,
              border: `1px solid ${FR.border}`,
            }}
          >
            <div
              className="font-mono text-[9px] font-semibold tracking-[0.1em] mb-1.5"
              style={{ color: FR.sub }}
            >
              ZONES
            </div>
            {[
              { label: "Danger", color: FR.red },
              { label: "Warm Zone", color: FR.orange },
              { label: "Cold Zone", color: FR.green },
              { label: "Staging", color: FR.purple },
              { label: "Landing", color: FR.blue },
            ].map((z) => (
              <div key={z.label} className="flex items-center gap-2 py-0.5">
                <SolidSquare
                  color={z.color}
                  size={8}
                  style={{ borderRadius: "50%" }}
                />
                <span
                  className="text-[11px]"
                  style={{ color: FR.sub }}
                >
                  {z.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* MIDDLE — Intelligence stack */}
        <aside
          className="flex flex-col overflow-hidden"
          style={{ borderRight: `1px solid ${FR.border}` }}
        >
          {/* Summary */}
          <div
            className="flex flex-col p-3 shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={12} style={{ color: FR.blue }} />
              <FrLabel>INCIDENT SUMMARY</FrLabel>
            </div>
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

          {/* Units */}
          <div
            className="flex flex-col p-3 shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Users size={12} style={{ color: FR.sub }} />
              <FrLabel>
                UNITS ({incident.data?.units?.length ?? 0})
              </FrLabel>
            </div>
            {(incident.data?.units?.length ?? 0) === 0 ? (
              <p className="text-[11px]" style={{ color: FR.dim }}>
                No units joined yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {incident.data!.units.map((u) => (
                  <span
                    key={u.id}
                    className="font-mono text-[10px] font-semibold tracking-[0.04em] px-1.5 py-0.5"
                    style={{
                      background: FR.red + "22",
                      border: `1px solid ${FR.red}55`,
                      color: FR.red,
                    }}
                  >
                    {u.callsign}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="flex-1 flex flex-col min-h-0 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={12} style={{ color: FR.orange }} />
              <FrLabel>ZONE SUGGESTIONS</FrLabel>
              {(suggestions.data?.length ?? 0) > 0 && (
                <span
                  className="ml-auto font-mono text-[9px] font-bold px-1.5 py-0.5"
                  style={{ background: FR.orange, color: "#000" }}
                >
                  {suggestions.data!.length}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {(suggestions.data ?? []).length === 0 && (
                <p className="text-[11px]" style={{ color: FR.dim }}>
                  No pending suggestions.
                </p>
              )}
              {suggestions.data?.map((s) => {
                const data = s.data_json as {
                  zone_type?: string;
                  label?: string;
                  reason?: string;
                };
                return (
                  <div
                    key={s.id}
                    className="p-2.5"
                    style={{
                      background: FR.card,
                      border: `1px solid ${FR.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5"
                        style={{
                          background: FR.red + "22",
                          border: `1px solid ${FR.red}55`,
                          color: FR.red,
                        }}
                      >
                        {data.zone_type ?? "ZONE"}
                      </span>
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: FR.dim }}
                      >
                        {new Date(s.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] mb-2" style={{ color: "#ccc" }}>
                      <strong className="text-white">{data.label}</strong>
                      {" — "}
                      {data.reason}
                    </p>
                    <div className="flex gap-1">
                      <button
                        onClick={() =>
                          resolve.mutate({ id: s.id, action: "accept" })
                        }
                        disabled={resolve.isPending}
                        className="flex-1 py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] transition-colors"
                        style={{
                          background: FR.green,
                          color: "#000",
                          border: `1px solid ${FR.green}`,
                        }}
                      >
                        ACCEPT
                      </button>
                      <button
                        onClick={() =>
                          resolve.mutate({ id: s.id, action: "reject" })
                        }
                        disabled={resolve.isPending}
                        className="flex-1 py-1.5 font-mono text-[10px] font-bold tracking-[0.06em] transition-colors"
                        style={{
                          background: "transparent",
                          color: FR.sub,
                          border: `1px solid ${FR.border}`,
                        }}
                      >
                        REJECT
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* RIGHT — Timeline */}
        <aside className="flex flex-col overflow-hidden">
          <div
            className="p-3 shrink-0"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <FrLabel>COMMUNICATIONS</FrLabel>
              <span
                className="font-mono text-[10px]"
                style={{ color: FR.dim }}
              >
                {comms.length} entries
              </span>
            </div>
            <div className="flex gap-1">
              <div className="flex-1 flex items-center gap-2 px-2 py-1.5" style={{ background: "#0a0a0a", border: `1px solid ${FR.border}` }}>
                <Search size={12} style={{ color: FR.dim }} />
                <input
                  placeholder="Search transcript…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim())
                      search.mutate();
                  }}
                  className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-[#444]"
                  style={{ color: FR.text }}
                />
              </div>
              {searchResults && (
                <button
                  onClick={() => {
                    setSearchResults(null);
                    setSearchQuery("");
                  }}
                  className="px-2 text-[10px] font-mono tracking-[0.06em]"
                  style={{
                    background: FR.card,
                    border: `1px solid ${FR.border}`,
                    color: FR.sub,
                  }}
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {comms.length === 0 && (
              <p
                className="text-center text-[11px] p-6"
                style={{ color: FR.dim }}
              >
                {searchResults
                  ? "No matches found."
                  : "Waiting for communications…"}
              </p>
            )}
            {comms.map((c) => (
              <TimelineEntry key={c.id} comm={c} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TimelineEntry({
  comm,
}: {
  comm: import("@/lib/types").Communication;
}) {
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
      className="px-3 py-2.5 flex gap-2.5 fr-entry-new"
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

function DispatchButton({
  incidentName,
  units,
  onOpenChange,
}: {
  incidentName: string;
  units: import("@/lib/types").Unit[];
  onOpenChange?: (open: boolean) => void;
}) {
  const [dispatched, setDispatched] = useState(false);
  const [open, setOpen] = useState(false);

  const setOpenWithCallback = (val: boolean) => {
    setOpen(val);
    onOpenChange?.(val);
  };

  const handleDispatch = () => {
    setDispatched(true);
    setOpenWithCallback(false);
    toast.success(`Units dispatched to ${incidentName}`, {
      description:
        units.length > 0
          ? `${units.map((u) => u.callsign).join(", ")} are en route.`
          : "Awaiting unit assignment.",
      duration: 6000,
    });
  };

  return (
    <>
      <button
        onClick={() => setOpenWithCallback(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[0.04em] transition-colors"
        style={{
          background: dispatched ? FR.card : FR.red,
          color: dispatched ? FR.sub : "#fff",
          border: `1px solid ${dispatched ? FR.border : FR.red}`,
        }}
      >
        <Radio size={12} />
        {dispatched ? "Dispatched" : "Dispatch Units"}
      </button>

      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)", zIndex: 9999 }}
        >
          <div
            className="p-6 w-full max-w-sm space-y-4"
            style={{
              background: FR.panel,
              border: `2px solid ${FR.text}`,
            }}
          >
            <div>
              <FrLabel>CONFIRM DISPATCH</FrLabel>
              <p
                className="text-[13px] mt-2"
                style={{ color: "#ccc" }}
              >
                Confirm dispatch of all units to{" "}
                <span
                  className="font-semibold"
                  style={{ color: FR.text }}
                >
                  {incidentName}
                </span>
                .
              </p>
            </div>

            {units.length > 0 ? (
              <div className="space-y-2">
                <FrLabel>UNITS ON SCENE</FrLabel>
                <div className="flex flex-wrap gap-1">
                  {units.map((u) => (
                    <span
                      key={u.id}
                      className="font-mono text-[10px] font-semibold tracking-[0.04em] px-1.5 py-0.5"
                      style={{
                        background: FR.card,
                        border: `1px solid ${FR.border}`,
                        color: FR.text,
                      }}
                    >
                      {u.callsign}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p
                className="text-[11px]"
                style={{ color: FR.orange }}
              >
                No units have joined yet.
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleDispatch}
                className="flex-1 py-2.5 font-mono text-[11px] font-bold tracking-[0.1em]"
                style={{
                  background: FR.red,
                  color: "#fff",
                  border: `1px solid ${FR.red}`,
                }}
              >
                CONFIRM DISPATCH
              </button>
              <button
                onClick={() => setOpenWithCallback(false)}
                className="flex-1 py-2.5 font-mono text-[11px] font-bold tracking-[0.1em]"
                style={{
                  background: "transparent",
                  color: FR.sub,
                  border: `1px solid ${FR.border}`,
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}