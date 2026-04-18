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

export function ConnectionBadge({ status }: { status: WSStatus }) {
  return <Badge className={cn("text-[10px]", COLOR[status])}>{LABEL[status]}</Badge>;
}
