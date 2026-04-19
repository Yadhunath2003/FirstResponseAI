"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateIncidentDialog } from "@/components/create-incident-dialog";
import { ChevronLeft, ChevronRight, Loader2, Plus, Radio, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
      <div className="flex flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2">
          <Link href="/responder">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ChevronLeft className="size-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Incidents</h1>
        </header>
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <p className="text-sm text-muted-foreground">You need to register before joining an incident.</p>
            <Link
              href="/responder/register"
              className={buttonVariants({ className: "w-full h-11 text-base" })}
            >
              Register unit
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/responder">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ChevronLeft className="size-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight leading-tight">Incidents</h1>
            <p className="text-xs text-muted-foreground truncate">{callsign}</p>
          </div>
        </div>
        <CreateIncidentDialog
          detailPathBase="/responder/incidents"
          autoJoinAs={unitId}
          onCreated={(inc) => setActiveIncident(inc.id)}
          trigger={
            <Button size="sm" className="h-9">
              <Plus className="size-4" /> New
            </Button>
          }
        />
      </header>

      <div className="p-4 space-y-3">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading incidents…
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive text-center py-4">
            Failed to load: {error.message}
          </p>
        )}

        {incidents?.map((inc) => {
          const isPending = join.isPending && join.variables === inc.id;
          return (
            <button
              key={inc.id}
              type="button"
              disabled={join.isPending}
              onClick={() => join.mutate(inc.id)}
              className={cn(
                "w-full text-left rounded-lg border bg-card hover:bg-accent active:bg-accent transition-colors",
                "disabled:opacity-60",
              )}
            >
              <div className="p-4 flex items-center gap-3">
                <div className="shrink-0 size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Radio className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold truncate">{inc.name}</h2>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {inc.incident_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {inc.location_name}
                  </p>
                </div>
                {isPending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                )}
              </div>
            </button>
          );
        })}

        {incidents?.length === 0 && !isLoading && (
          <div className="flex flex-col items-center text-center gap-2 py-12 text-muted-foreground">
            <Inbox className="size-8" />
            <p className="text-sm">No active incidents.</p>
            <p className="text-xs">Tap <span className="font-medium">+ New</span> to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
