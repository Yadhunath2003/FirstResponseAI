"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WSStatus } from "@/lib/ws";

const LABEL: Record<WSStatus, string> = {
  idle: "idle",
  connecting: "connecting…",
  open: "live",
  closed: "reconnecting…",
  error: "error",
};

const COLOR: Record<WSStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  connecting: "bg-amber-500/20 text-amber-300",
  open: "bg-emerald-500/20 text-emerald-300",
  closed: "bg-amber-500/20 text-amber-300",
  error: "bg-red-500/20 text-red-300",
};

const DOT: Record<WSStatus, string> = {
  idle: "bg-muted-foreground",
  connecting: "bg-amber-400 animate-pulse",
  open: "bg-emerald-400",
  closed: "bg-amber-400 animate-pulse",
  error: "bg-red-400",
};

export function ConnectionBadge({ status }: { status: WSStatus }) {
  return (
    <Badge className={cn("text-[11px] gap-1.5 px-2 py-0.5", COLOR[status])}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} />
      {LABEL[status]}
    </Badge>
  );
}
