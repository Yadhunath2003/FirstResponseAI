"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  FR,
  FrLabel,
  SolidSquare,
  TypeBadge,
  StatusBadge,
  TYPE_META,
} from "@/components/fr/atoms";
import { ArrowLeft, Plus, MapPin, Wifi } from "lucide-react";
import { toast } from "sonner";

export default function IncidentsListPage() {
  const router = useRouter();
  const { unitId, callsign, setActiveIncident } = useSession();
  const { data: incidents, isLoading, error } = useQuery({
    queryKey: ["incidents"],
    queryFn: api.listIncidents,
    refetchInterval: 5000,
  });

  const join = useMutation({
    mutationFn: (incidentId: string) =>
      api.joinIncident(incidentId, unitId!).then(() => incidentId),
    onSuccess: (incidentId) => {
      setActiveIncident(incidentId);
      router.push(`/responder/incidents/${incidentId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!unitId) {
    return (
      <div
        className="min-h-[100dvh] flex flex-col"
        style={{ background: FR.bg }}
      >
        <div className="p-5">
          <p className="text-[13px] mb-3" style={{ color: FR.text }}>
            You need to register first.
          </p>
          <Link
            href="/responder/register"
            className="block w-full py-3 font-mono text-[12px] font-bold tracking-[0.1em] text-center"
            style={{
              background: FR.red,
              color: "#fff",
              border: `1px solid ${FR.red}`,
            }}
          >
            REGISTER UNIT →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: FR.bg }}
    >
      {/* Header */}
      <header
        className="flex items-stretch shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <Link
          href="/responder"
          className="flex items-center px-4 py-3 transition-colors"
          style={{ borderRight: `1px solid ${FR.border}`, color: FR.sub }}
          onMouseEnter={(e) => (e.currentTarget.style.color = FR.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = FR.sub)}
        >
          <ArrowLeft size={16} />
        </Link>
        <div
          className="flex-1 px-4 py-3"
          style={{ borderLeft: `3px solid ${FR.blue}` }}
        >
          <div className="text-sm font-semibold text-white leading-tight">
            Active Incidents
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: FR.sub }}>
            <SolidSquare color={FR.green} size={6} style={{ borderRadius: "50%" }} />
            <span>Signed in as {callsign}</span>
          </div>
        </div>
      </header>

      {/* Loading / error */}
      {isLoading && (
        <p className="p-5 text-[12px]" style={{ color: FR.sub }}>
          Loading incidents…
        </p>
      )}
      {error && (
        <div
          className="m-5 p-3"
          style={{
            background: FR.card,
            border: `1px solid ${FR.red}`,
            color: FR.red,
          }}
        >
          <p className="text-[12px]">Failed to load: {error.message}</p>
        </div>
      )}

      {/* Incident list */}
      <div className="p-4 space-y-2.5 flex-1 overflow-y-auto">
        {incidents?.length === 0 && (
          <p className="text-center py-10 text-[12px]" style={{ color: FR.dim }}>
            No active incidents.
          </p>
        )}
        {incidents?.map((inc) => {
          const meta = TYPE_META[inc.incident_type] || TYPE_META.other;
          const isActive = inc.status === "active";
          return (
            <div
              key={inc.id}
              className="p-4"
              style={{
                background: FR.card,
                borderTop: `1px solid ${FR.border}`,
                borderRight: `1px solid ${FR.border}`,
                borderBottom: `1px solid ${FR.border}`,
                borderLeft: `3px solid ${isActive ? meta.color : FR.border}`,
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-white leading-tight truncate">
                    {inc.name}
                  </div>
                  <div
                    className="flex items-center gap-1 text-[11px] mt-1"
                    style={{ color: FR.sub }}
                  >
                    <MapPin size={10} strokeWidth={2} />
                    <span className="truncate">{inc.location_name}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <TypeBadge type={inc.incident_type} small />
                <StatusBadge status={inc.status} />
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <Wifi size={11} style={{ color: FR.sub }} strokeWidth={2} />
                  <span className="text-[11px]" style={{ color: FR.sub }}>
                    {inc.unit_count ?? 0} unit{inc.unit_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <button
                onClick={() => join.mutate(inc.id)}
                disabled={join.isPending}
                className="w-full py-2.5 font-mono text-[11px] font-bold tracking-[0.1em] transition-colors"
                style={{
                  background: meta.color,
                  color: "#000",
                  border: `1px solid ${meta.color}`,
                  cursor: join.isPending ? "wait" : "pointer",
                }}
              >
                {join.isPending ? "JOINING…" : "JOIN INCIDENT →"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}