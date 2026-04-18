"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateIncidentDialog } from "@/components/create-incident-dialog";
import { Plus } from "lucide-react";

export default function DashboardHome() {
  const { data: incidents, isLoading, error } = useQuery({
    queryKey: ["incidents"],
    queryFn: api.listIncidents,
    refetchInterval: 5_000,
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Active incidents</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateIncidentDialog
            detailPathBase="/dashboard"
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" /> New incident
              </Button>
            }
          />
          <Link href="/dashboard/dispatch" className={buttonVariants({ variant: "outline" })}>
            Dispatch
          </Link>
        </div>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Failed to reach the API. Is the FastAPI server running?
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {incidents?.map((inc) => (
          <Card key={inc.id} className="hover:border-foreground/20 transition">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base truncate">{inc.name}</CardTitle>
              <Badge variant={inc.status === "active" ? "default" : "secondary"}>
                {inc.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="text-muted-foreground truncate">
                {inc.location_name || "—"}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{inc.incident_type}</span>
                <span>{new Date(inc.created_at).toLocaleString()}</span>
              </div>
              <Link
                href={`/dashboard/${inc.id}`}
                className={buttonVariants({ size: "sm", className: "w-full" })}
              >
                Open
              </Link>
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
