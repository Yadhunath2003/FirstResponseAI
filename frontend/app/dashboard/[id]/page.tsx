"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { audioUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import { useChannelRoom } from "@/lib/use-channel-room";
import type { ChannelId, WSMessage } from "@/lib/types";
import { IncidentMap } from "@/components/incident-map";
import { ArrowLeft, Search, Radio, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

const CHANNEL_BADGE = {
  command: {
    hot: "border-red-500/55 bg-red-500/20 text-red-400",
    cold: "border-red-500/40 bg-[#111] text-zinc-500",
    chip: "border-red-500/35 text-red-300",
    dot: "bg-red-500",
  },
  triage: {
    hot: "border-amber-500/55 bg-amber-500/20 text-amber-400",
    cold: "border-amber-500/40 bg-[#111] text-zinc-500",
    chip: "border-amber-500/35 text-amber-300",
    dot: "bg-amber-500",
  },
  logistics: {
    hot: "border-blue-500/55 bg-blue-500/20 text-blue-400",
    cold: "border-blue-500/40 bg-[#111] text-zinc-500",
    chip: "border-blue-500/35 text-blue-300",
    dot: "bg-blue-500",
  },
  comms: {
    hot: "border-emerald-500/55 bg-emerald-500/20 text-emerald-400",
    cold: "border-emerald-500/40 bg-[#111] text-zinc-500",
    chip: "border-emerald-500/35 text-emerald-300",
    dot: "bg-emerald-500",
  },
} as const;

const ZONE_LEGEND = [
  { label: "Danger", dot: "border-red-500 bg-red-500/30" },
  { label: "Warm Zone", dot: "border-amber-500 bg-amber-500/30" },
  { label: "Cold Zone", dot: "border-emerald-500 bg-emerald-500/30" },
  { label: "Staging", dot: "border-purple-500 bg-purple-500/30" },
  { label: "Landing", dot: "border-blue-500 bg-blue-500/30" },
];

function fmtIncidentType(value?: string) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtStatus(value?: string) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function zoneTone(zoneType?: string) {
  const t = zoneType?.toLowerCase() ?? "";
  if (t.includes("danger") || t.includes("hot") || t.includes("evac")) {
    return "border-red-500/40 bg-red-500/12 text-red-400";
  }
  if (t.includes("warm")) return "border-amber-500/40 bg-amber-500/12 text-amber-400";
  if (t.includes("cold") || t.includes("safe")) {
    return "border-emerald-500/40 bg-emerald-500/12 text-emerald-400";
  }
  if (t.includes("staging")) return "border-purple-500/40 bg-purple-500/12 text-purple-400";
  if (t.includes("landing")) return "border-blue-500/40 bg-blue-500/12 text-blue-400";
  return "border-blue-500/40 bg-blue-500/12 text-blue-400";
}

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
  const [searchResults, setSearchResults] = useState<
    import("@/lib/types").Communication[] | null
  >(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);

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

  const operatorUnitId = useMemo(() => `operator-${deviceId.slice(0, 8)}`, [deviceId]);

  // Dashboard monitors every talkgroup for this incident. One LiveKit room
  // per channel, listen-only (no publish grant). LiveKit auto-attaches
  // remote audio via HTMLMediaElement, so there's no AudioContext unlock
  // gesture required for the operator.
  const channelIds = useMemo<ChannelId[]>(
    () => ["command", "triage", "logistics", "comms"],
    [],
  );
  const command = useChannelRoom({
    incidentId, channelId: "command", unitId: operatorUnitId,
    callsign: "Dispatch", canPublish: false, enabled: true,
  });
  const triage = useChannelRoom({
    incidentId, channelId: "triage", unitId: operatorUnitId,
    callsign: "Dispatch", canPublish: false, enabled: true,
  });
  const logistics = useChannelRoom({
    incidentId, channelId: "logistics", unitId: operatorUnitId,
    callsign: "Dispatch", canPublish: false, enabled: true,
  });
  const commsRoom = useChannelRoom({
    incidentId, channelId: "comms", unitId: operatorUnitId,
    callsign: "Dispatch", canPublish: false, enabled: true,
  });
  const rooms = { command, triage, logistics, comms: commsRoom } as const;
  const totalListeners = command.participantCount + triage.participantCount
    + logistics.participantCount + commsRoom.participantCount;

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
        case "zone_suggestion":
          qc.invalidateQueries({ queryKey: ["suggestions", incidentId] });
          toast.info("New AI zone suggestion");
          break;
        case "unit_joined":
          qc.invalidateQueries({ queryKey: ["incident", incidentId] });
          toast.success(`${(msg as { unit_callsign?: string }).unit_callsign} joined`);
          break;
        case "conflict":
          toast.warning(`Conflict: ${(msg as { description?: string }).description}`);
          break;
      }
    },
    [qc, incidentId],
  );

  // Operator uses the deviceId as the "unit" for WS identity.
  const { status: wsStatus } = useIncidentSocket({
    incidentId,
    unitId: operatorUnitId,
    onMessage: handleMessage,
  });

  const resolve = useMutation({
    mutationFn: ({ id, action, radius }: { id: string; action: "accept" | "reject"; radius?: number }) =>
      api.resolveSuggestion(incidentId, id, action, {
        resolved_by: "operator",
        lat: incident.data?.location_lat,
        lng: incident.data?.location_lng,
        radius,
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

  const timelineComms = searchResults ?? timeline.data ?? [];

  useEffect(() => {
    const parent = timelineEndRef.current?.parentElement;
    if (!parent) return;
    parent.scrollTop = parent.scrollHeight;
  }, [timelineComms.length]);

  const searching = search.isPending;
  const aiUpdating = incident.isFetching || suggestions.isFetching || zones.isFetching;
  const wsConnected = wsStatus === "connected";
  const hasPendingSuggestions = (suggestions.data?.length ?? 0) > 0;
  const mainGridClass = hasPendingSuggestions
    ? "grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_280px_300px]"
    : "grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1.35fr_280px_300px]";

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#070707] text-zinc-100">
      <header className="flex min-h-12 items-center gap-2 border-b border-[#1b1b1b] px-4 py-2">
        <Link
          href="/dashboard"
          className="grid size-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-900"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="size-4" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-zinc-100">
            {incident.data?.name ?? "Incident"}
          </p>
          <p className="truncate text-[10px] text-zinc-500">
            {incident.data?.location_name ?? ""}
          </p>
        </div>

        <div className="hidden items-center gap-1.5 xl:flex">
          {channelIds.map((cid) => {
            const room = rooms[cid];
            const hot = room.speakers.length > 0;
            const palette = CHANNEL_BADGE[cid];
            return (
              <span
                key={cid}
                className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.08em] ${hot ? palette.hot : palette.cold}`}
                title={`${cid} · ${room.participantCount} on air${hot ? " · live" : ""}`}
              >
                {hot ? "LIVE " : ""}
                {cid}
              </span>
            );
          })}
          <span className="rounded border border-[#1b1b1b] px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
            {totalListeners} units live
          </span>
        </div>

        <span className="hidden rounded border border-[#1b1b1b] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 md:inline-flex">
          {fmtIncidentType(incident.data?.incident_type)}
        </span>
        <span
          className={`hidden rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] md:inline-flex ${incident.data?.status === "active" ? "border-emerald-500/55 text-emerald-400" : "border-[#1b1b1b] text-zinc-500"}`}
        >
          {fmtStatus(incident.data?.status)}
        </span>

        <DispatchButton
          incidentId={incidentId}
          incidentName={incident.data?.name ?? "Incident"}
          units={incident.data?.units ?? []}
          onOpenChange={setDispatchOpen}
        />

        <div className="flex items-center gap-1 rounded border border-[#1b1b1b] px-2 py-1">
          <span
            className={`size-2 rounded-full ${wsConnected ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(34,197,94,0.2)]" : "bg-red-500"}`}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
            WS
          </span>
          {wsConnected ? <Wifi className="size-3 text-emerald-500" /> : <WifiOff className="size-3 text-red-500" />}
        </div>
      </header>

      <main className={`${mainGridClass} transition-[grid-template-columns] duration-300`}>
        <section className="relative min-h-[260px] overflow-hidden border-b border-[#1b1b1b] transition-all duration-300 md:border-r md:border-b-0">
          {!dispatchOpen && <IncidentMap center={center} zones={zones.data ?? []} interactive />}

          <div className="pointer-events-none absolute bottom-12 left-3 flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-black/80 p-2">
            {ZONE_LEGEND.map((z) => (
              <div key={z.label} className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full border border-dashed ${z.dot}`} />
                <span className="text-[10px] text-zinc-400">
                  {z.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-0 flex-col gap-2 overflow-y-auto border-b border-[#1b1b1b] p-3 md:border-r md:border-b-0">
          <div className={`overflow-hidden rounded-md border border-[#1b1b1b] bg-[#0d0d0d] ${aiUpdating ? "animate-pulse" : ""}`}>
            <div className="flex items-center gap-2 border-b border-[#1b1b1b] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Incident Summary
              </span>
              {aiUpdating && (
                <span className="ml-auto text-[9px] font-semibold tracking-[0.08em] text-blue-400">
                  Refreshing...
                </span>
              )}
            </div>
            <div className="space-y-2 px-3 py-2.5">
              {incident.data?.initial_summary && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                    Initial Report
                  </p>
                  <p className="text-xs leading-5 text-zinc-300">{incident.data.initial_summary}</p>
                </div>
              )}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-zinc-500">
                  Live Update
                </p>
                <p className="text-xs leading-5 text-zinc-300">
                  {incident.data?.summary && incident.data.summary !== "No summary available."
                    ? incident.data.summary
                    : "No summary yet. Waiting for communications."}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-[#1b1b1b] bg-[#0d0d0d]">
            <div className="flex items-center border-b border-[#1b1b1b] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Units ({incident.data?.units?.length ?? 0})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3 py-2.5">
              {(incident.data?.units ?? []).length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No units joined yet.
                </p>
              ) : (
                incident.data!.units.map((u) => (
                  <span
                    key={u.id}
                    className="rounded border border-red-500/40 bg-red-500/12 px-2 py-1 text-[11px] font-semibold text-red-200"
                  >
                    {u.callsign}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#1b1b1b] bg-[#0d0d0d]">
            <div className="flex items-center gap-2 border-b border-[#1b1b1b] px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Zone Suggestions
              </span>
              {(suggestions.data?.length ?? 0) > 0 && (
                <span className="ml-auto rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                  {suggestions.data!.length}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
              {(suggestions.data ?? []).length === 0 && (
                <p className="text-center text-xs text-zinc-500">
                  No pending suggestions
                </p>
              )}
              {suggestions.data?.map((s) => {
                const data = s.data_json as {
                  zone_type?: string;
                  label?: string;
                  reason?: string;
                  radius_meters?: number;
                };
                const tone = zoneTone(data.zone_type);
                return (
                  <div key={s.id} className="rounded-md border border-zinc-800 bg-[#0f0f0f] px-2.5 py-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${tone}`}>
                        {data.zone_type ?? "zone"}
                      </span>
                      <span className="text-[10px] text-zinc-500">{fmtTime(s.created_at)}</span>
                    </div>
                    <p className="mb-2 text-xs leading-5 text-zinc-300">
                      <span className="font-semibold text-zinc-100">{data.label ?? "Suggested zone"}</span> - {data.reason ?? "No reason provided."}
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          resolve.mutate({
                            id: s.id,
                            action: "accept",
                            radius: typeof data.radius_meters === "number" ? data.radius_meters : undefined,
                          })
                        }
                        disabled={resolve.isPending}
                        className="flex-1 rounded border border-emerald-500/40 bg-emerald-500/12 px-2 py-1.5 text-[11px] font-semibold text-emerald-400 transition disabled:opacity-60"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => resolve.mutate({ id: s.id, action: "reject" })}
                        disabled={resolve.isPending}
                        className="flex-1 rounded border border-zinc-700 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 transition hover:border-zinc-500 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden bg-[#070707]">
          <div className="border-b border-[#1b1b1b] px-3 py-2">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Communications
              </span>
              <span className="ml-auto text-[10px] text-zinc-500">{timelineComms.length} entries</span>
            </div>
            <div className="relative flex items-center gap-1.5">
              <Search className="pointer-events-none absolute left-2 size-3 text-zinc-500" />
              <input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim().length === 0) setSearchResults(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) search.mutate();
                }}
                placeholder="Search transcript..."
                className="w-full rounded border border-zinc-800 bg-[#0a0a0a] py-1.5 pl-7 pr-16 text-xs text-zinc-100 outline-none"
              />
              <button
                type="button"
                onClick={() => search.mutate()}
                disabled={!searchQuery.trim() || searching}
                className="absolute right-8 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-500 disabled:opacity-50"
              >
                Go
              </button>
              {searchResults && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchResults(null);
                    setSearchQuery("");
                  }}
                  className="absolute right-2 text-xs text-zinc-500"
                >
                  x
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {timelineComms.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-500">
                No communications yet.
              </p>
            )}
            {timelineComms.map((c) => (
              <CommEntry key={c.id} c={c} query={searchQuery} />
            ))}
            <div ref={timelineEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}

function CommEntry({
  c,
  query,
}: {
  c: import("@/lib/types").Communication;
  query: string;
}) {
  const palette = CHANNEL_BADGE[c.channel_id as ChannelId] ?? CHANNEL_BADGE.command;

  const renderHighlighted = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const splitRe = new RegExp(`(${escaped})`, "ig");
    const matchRe = new RegExp(`^${escaped}$`, "i");
    return text.split(splitRe).map((part, idx) =>
      matchRe.test(part) ? (
        <mark
          key={`${c.id}-${idx}`}
          className="rounded bg-blue-500/20 px-0.5 text-blue-400"
        >
          {part}
        </mark>
      ) : (
        <span key={`${c.id}-${idx}`}>{part}</span>
      ),
    );
  };

  return (
    <article className="border-b border-[#111] px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={`size-2 rounded-full ${palette.dot}`} />
        <span className="text-[11px] font-semibold text-zinc-100">{c.unit_callsign}</span>
        <span className={`rounded border bg-[#111] px-1.5 py-0.5 text-[10px] ${palette.chip}`}>
          {c.channel_id}
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">{fmtTime(c.timestamp)}</span>
      </div>

      {c.transcript && c.transcript !== "[no transcript]" && (
        <p className="pl-3 text-xs leading-5 text-zinc-300">{renderHighlighted(c.transcript)}</p>
      )}

      {c.audio_path && (
        <div className="mt-1.5 pl-3">
          <audio controls src={audioUrl(c.audio_path)} className="h-7 w-full" />
        </div>
      )}
    </article>
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
      description: units.length > 0
        ? `${units.map((u) => u.callsign).join(", ")} are en route.`
        : "Awaiting unit assignment.",
      duration: 6000,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenWithCallback(true)}
        className={`inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-[11px] font-semibold text-white ${dispatched ? "border border-emerald-500/55 bg-[#1a2a1a]" : "border border-transparent bg-red-500"}`}
      >
        <Radio className="size-3.5" />
        {dispatched ? "Dispatched" : "Dispatch Units"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85">
          <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-700 bg-[#111] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.8)]">
            <h2 className="text-lg font-semibold">Dispatch Units</h2>
            <p className="text-sm text-zinc-500">
              Confirm dispatch of all units to{" "}
              <span className="font-medium text-zinc-100">{incidentName}</span>.
            </p>
            {units.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Units on scene</p>
                <div className="flex flex-wrap gap-1">
                  {units.map((u) => (
                    <span key={u.id} className="rounded border border-red-500/40 bg-red-500/12 px-2 py-1 text-xs font-semibold text-red-200">
                      {u.callsign}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-400">No units have joined yet.</p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="flex-1 rounded bg-red-500 px-3 py-2 text-sm font-semibold text-white"
                onClick={handleDispatch}
              >
                Confirm Dispatch
              </button>
              <button
                type="button"
                className="flex-1 rounded border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-500"
                onClick={() => setOpenWithCallback(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}