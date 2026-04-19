"use client";

import { use, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useIncidentSocket } from "@/lib/ws";
import type { WSMessage } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IncidentMap } from "@/components/incident-map";
import { SummaryPanel } from "@/components/summary-panel";
import { Timeline } from "@/components/timeline";
import { ConnectionBadge } from "@/components/connection-badge";
import { ArrowLeft, Search, Sparkles, Users, Radio } from "lucide-react";
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
  const [searchResults, setSearchResults] = useState<
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
    unitId: `operator-${deviceId.slice(0, 8)}`,
    onMessage: handleMessage,
  });

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

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="p-3 border-b flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-semibold truncate">
              {incident.data?.name ?? "Incident"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {incident.data?.location_name ?? ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{incident.data?.incident_type ?? "—"}</Badge>
          <Badge variant={incident.data?.status === "active" ? "default" : "secondary"}>
            {incident.data?.status ?? "—"}
          </Badge>
          <DispatchButton
            incidentId={incidentId}
            incidentName={incident.data?.name ?? "Incident"}
            units={incident.data?.units ?? []}
            onOpenChange={setDispatchOpen}
          />
          <ConnectionBadge status={wsStatus} />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        {/* Map — large left */}
        <section className="col-span-12 lg:col-span-7 rounded-md overflow-hidden border">
          {!dispatchOpen && <IncidentMap center={center} zones={zones.data ?? []} />}
        </section>

        {/* Right column: summary, units, suggestions */}
        <aside className="col-span-12 lg:col-span-5 flex flex-col gap-3 min-h-0">
          <div className="h-[32%] min-h-[160px]">
            <SummaryPanel summary={incident.data?.summary ?? ""} initialSummary={incident.data?.initial_summary} />
          </div>

          <Card className="h-[22%] min-h-[120px] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="size-4" /> Units ({incident.data?.units?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {(incident.data?.units ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No units joined yet.</p>
              ) : (
                <ul className="flex flex-wrap gap-1">
                  {incident.data!.units.map((u) => (
                    <li key={u.id}>
                      <Badge variant="secondary" className="text-[10px]">
                        {u.callsign}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="size-4" /> AI Suggestions
                {(suggestions.data?.length ?? 0) > 0 && (
                  <Badge className="ml-auto">{suggestions.data!.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto space-y-2">
              {(suggestions.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No pending suggestions.</p>
              )}
              {suggestions.data?.map((s) => {
                const data = s.data_json as {
                  zone_type?: string;
                  label?: string;
                  reason?: string;
                };
                return (
                  <div key={s.id} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{data.zone_type ?? "zone"}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(s.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs">
                      <strong>{data.label}</strong> — {data.reason}
                    </p>
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        onClick={() => resolve.mutate({ id: s.id, action: "accept" })}
                        disabled={resolve.isPending}
                      >
                        Accept
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => resolve.mutate({ id: s.id, action: "reject" })}
                        disabled={resolve.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Timeline row */}
      <section className="border-t h-[30%] min-h-[220px] flex flex-col">
        <div className="p-2 border-b flex items-center gap-2">
          <h2 className="text-sm font-medium mr-2">Timeline</h2>
          <div className="flex-1 flex items-center gap-2 max-w-md">
            <Input
              placeholder="Search communications…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) search.mutate();
              }}
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!searchQuery.trim() || search.isPending}
              onClick={() => search.mutate()}
            >
              <Search className="size-3" />
            </Button>
            {searchResults && (
              <Button size="sm" variant="ghost" onClick={() => setSearchResults(null)}>
                Clear
              </Button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <Timeline comms={searchResults ?? timeline.data ?? []} />
        </div>
      </section>
    </div>
  );
}

function DispatchButton({
  incidentId,
  incidentName,
  units,
  onOpenChange,
}: {
  incidentId: string;
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
      <Button
        size="sm"
        variant={dispatched ? "secondary" : "destructive"}
        onClick={() => setOpenWithCallback(true)}
        className="gap-1.5"
      >
        <Radio className="size-3.5" />
        {dispatched ? "Dispatched" : "Dispatch Units"}
      </Button>

      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60"
          style={{ zIndex: 9999 }}
        >
          <div className="bg-background border rounded-lg p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Dispatch Units</h2>
            <p className="text-sm text-muted-foreground">
              Confirm dispatch of all units to{" "}
              <span className="text-foreground font-medium">{incidentName}</span>.
            </p>
            {units.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Units on scene</p>
                <div className="flex flex-wrap gap-1">
                  {units.map((u) => (
                    <Badge key={u.id} variant="outline" className="text-xs">
                      {u.callsign}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-400">No units have joined yet.</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" variant="destructive" onClick={handleDispatch}>
                Confirm Dispatch
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setOpenWithCallback(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}