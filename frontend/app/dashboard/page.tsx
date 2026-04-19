"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  FR,
  SolidSquare,
  TypeBadge,
  StatusBadge,
  PriorityBadge,
  TYPE_META,
} from "@/components/fr/atoms";
import { ArrowLeft, MapPin, Plus, Users, Wifi } from "lucide-react";
import type { Incident } from "@/lib/types";

type IncidentWithMeta = Incident & {
  priority?: string;
};

export default function DashboardHome() {
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const { data: incidents, isLoading, error } = useQuery({
    queryKey: ["incidents"],
    queryFn: api.listIncidents,
    refetchInterval: 5_000,
  });

  const list = (incidents ?? []) as IncidentWithMeta[];

  const filtered =
    filter === "all" ? list : list.filter((i) => i.status === filter);

  const relTime = (iso: string) => {
    const diff = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    return `${h}h ${diff % 60}m ago`;
  };

  const stats = {
    active: list.filter((i) => i.status === "active").length,
    p1: list.filter((i) => (i.priority ?? "emergency") === "emergency").length,
    p2: list.filter((i) => i.priority === "urgent").length,
    units: list.reduce((s, i) => s + (i.unit_count ?? 0), 0),
  };

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: FR.bg }}
    >
      {/* Top nav */}
      <header
        className="flex items-center gap-3 px-5 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <Link
          href="/"
          className="flex items-center px-1.5 py-1.5 transition-colors"
          style={{ color: FR.sub }}
          onMouseEnter={(e) => (e.currentTarget.style.color = FR.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = FR.sub)}
        >
          <ArrowLeft size={18} />
        </Link>

        <div className="flex items-center gap-2">
          <div
            className="w-[26px] h-[26px] flex items-center justify-center"
            style={{
              background: FR.blue + "22",
              border: `1px solid ${FR.blue}44`,
            }}
          >
            <MapPin size={13} style={{ color: FR.blue }} strokeWidth={2} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-white">
            Dispatch Dashboard
          </span>
        </div>

        {/* Filter tabs */}
        <div
          className="ml-4 flex gap-0.5 p-[3px]"
          style={{
            background: FR.panel,
            border: `1px solid ${FR.border}`,
          }}
        >
          {(["all", "active", "closed"] as const).map((f) => {
            const active = filter === f;
            const count =
              f === "all"
                ? list.length
                : list.filter((i) => i.status === f).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-[11px] font-semibold tracking-[0.02em] transition-colors"
                style={{
                  background: active ? "#fff" : "transparent",
                  color: active ? "#000" : FR.sub,
                }}
              >
                {f === "all"
                  ? `All (${count})`
                  : f === "active"
                    ? `Active (${count})`
                    : `Closed (${count})`}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SolidSquare
              color={FR.green}
              size={7}
              className="fr-conn-live"
              style={{ borderRadius: "50%" }}
            />
            <span className="text-[11px]" style={{ color: FR.sub }}>
              WebSocket live
            </span>
          </div>
          <Link
            href="/dashboard/dispatch"
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-bold tracking-[0.02em] transition-colors"
            style={{
              background: FR.red,
              color: "#fff",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#c0392b")}
            onMouseLeave={(e) => (e.currentTarget.style.background = FR.red)}
          >
            <Plus size={13} strokeWidth={2.5} />
            New Incident
          </Link>
        </div>
      </header>

      {/* Stats strip */}
      <div
        className="flex items-center gap-5 px-5 py-2.5 flex-wrap shrink-0"
        style={{
          background: FR.panel,
          borderBottom: `1px solid ${FR.border}`,
        }}
      >
        <Stat value={stats.active} label="Active" color={FR.red} />
        <Stat value={stats.p1} label="P1 Emergency" color={FR.red} />
        <Stat value={stats.p2} label="P2 Urgent" color={FR.orange} />
        <Stat value={stats.units} label="Total Units" color={FR.blue} />
        <Stat value={2} label="Pending Actions" color={FR.purple} />
        <ClientClock now={now} />
      </div>

      {/* Incident grid */}
      <div className="flex-1 overflow-y-auto p-5">
        {isLoading && (
          <p className="text-sm" style={{ color: FR.sub }}>
            Loading…
          </p>
        )}
        {error && (
          <div
            className="p-3"
            style={{
              background: FR.card,
              border: `1px solid ${FR.red}`,
              color: FR.red,
            }}
          >
            <p className="text-sm">Failed to reach the API. Is the FastAPI server running?</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-20">
            <p style={{ color: FR.sub }}>No incidents match this filter.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((inc) => (
            <IncidentCard key={inc.id} inc={inc} relTime={relTime} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[17px] font-bold tabular-nums tracking-tight"
        style={{ color }}
      >
        {value}
      </span>
      <span
        className="text-[11px] tracking-[0.04em] uppercase"
        style={{ color: FR.dim }}
      >
        {label}
      </span>
    </div>
  );
}

function IncidentCard({
  inc,
  relTime,
}: {
  inc: IncidentWithMeta;
  relTime: (iso: string) => string;
}) {
  const meta = TYPE_META[inc.incident_type] || TYPE_META.other;
  const isActive = inc.status === "active";
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "#1f1f1f" : FR.card,
        borderTop: `1px solid ${hov ? "#3a3a3a" : "#252525"}`,
        borderRight: `1px solid ${hov ? "#3a3a3a" : "#252525"}`,
        borderBottom: `1px solid ${hov ? "#3a3a3a" : "#252525"}`,
        borderLeft: `3px solid ${isActive ? meta.color : FR.border}`,
        transition: "all 0.18s ease",
        position: "relative",
      }}
    >
      {/* Active pulse dot */}
      {isActive && (
        <div
          className="absolute top-3 right-3 w-[7px] h-[7px] rounded-full fr-conn-live"
          style={{ background: meta.color }}
        />
      )}

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-2 mb-2 pr-4">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-white tracking-tight mb-1 truncate">
              {inc.name}
            </div>
            <div
              className="flex items-center gap-1 text-[11px] truncate"
              style={{ color: FR.sub }}
            >
              <MapPin size={10} strokeWidth={2} />
              {inc.location_name || "—"}
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <TypeBadge type={inc.incident_type} small />
          <StatusBadge status={inc.status} />
          <PriorityBadge priority={inc.priority || "emergency"} />
        </div>

        {/* Meta row */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-1">
            <Wifi size={11} style={{ color: FR.sub }} strokeWidth={2} />
            <span className="text-[11px]" style={{ color: FR.sub }}>
              {inc.unit_count ?? 0} unit{inc.unit_count !== 1 ? "s" : ""}
            </span>
          </div>
          <span
            className="font-mono text-[11px] tabular-nums"
            style={{ color: FR.dim }}
          >
            {relTime(inc.created_at)}
          </span>
        </div>

        {/* Open button */}
        <Link
          href={`/dashboard/${inc.id}`}
          className="block w-full text-center px-2 py-2 text-[12px] font-semibold tracking-[0.02em] transition-colors"
          style={{
            background: hov ? meta.color + "22" : FR.panel,
            border: `1px solid ${hov ? meta.color + "66" : "#2a2a2a"}`,
            color: hov ? meta.color : FR.sub,
          }}
        >
          Open Incident →
        </Link>
      </div>
    </div>
  );
}
function ClientClock({ now }: { now: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div
      className="ml-auto font-mono text-[11px]"
      style={{ color: FR.dim }}
    >
      {mounted ? new Date(now).toLocaleTimeString("en", { hour12: false }) : "--:--:--"} — Auto-refresh 30s
    </div>
  );
}