"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateIncidentDialog } from "@/components/create-incident-dialog";
import { Plus } from "lucide-react";
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
      <div className="p-4">
        <p className="text-sm mb-3">You need to register first.</p>
        <Link href="/responder/register" className={buttonVariants({ className: "w-full" })}>
          Register unit
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Incidents</h1>
          <p className="text-xs text-muted-foreground truncate">Signed in as {callsign}</p>
        </div>
        <CreateIncidentDialog
          detailPathBase="/responder/incidents"
          autoJoinAs={unitId}
          onCreated={(inc) => setActiveIncident(inc.id)}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> New
            </Button>
          }
        />
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Failed to load: {error.message}</p>}

      <div className="space-y-2">
        {incidents?.map((inc) => (
          <Card key={inc.id}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
              <CardTitle className="text-sm truncate">{inc.name}</CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {inc.incident_type}
              </Badge>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <p className="text-xs text-muted-foreground truncate">{inc.location_name}</p>
              <Button
                size="sm"
                className="w-full"
                disabled={join.isPending}
                onClick={() => join.mutate(inc.id)}
              >
                Join
              </Button>
            </CardContent>
          </Card>
        ))}
        {incidents?.length === 0 && (
          <p className="text-sm text-muted-foreground">No active incidents.</p>
        )}
      </div>
    </div>
  );
}
