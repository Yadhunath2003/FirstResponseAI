"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { audioUrl } from "@/lib/api";
import type { Communication } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TimelineProps {
  comms: Communication[];
  className?: string;
  emptyLabel?: string;
}

const CHANNEL_COLOR: Record<string, string> = {
  command: "bg-red-500/20 text-red-300 border-red-500/40",
  triage: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  logistics: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  comms: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

export function Timeline({ comms, className, emptyLabel = "No communications yet." }: TimelineProps) {
  if (comms.length === 0) {
    return <p className="text-sm text-muted-foreground p-4">{emptyLabel}</p>;
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <ul className="divide-y divide-border">
        {comms.map((c) => (
          <li key={c.id} className="p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] uppercase", CHANNEL_COLOR[c.channel_id])}
                >
                  {c.channel_id}
                </Badge>
                <span className="text-xs font-medium">{c.unit_callsign}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {c.transcript && c.transcript !== "[no transcript]" && (
              <p className="text-sm">{c.transcript}</p>
            )}
            {c.audio_path && (
              <audio
                controls
                src={audioUrl(c.audio_path)}
                className="w-full h-8 mt-1"
              />
            )}
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
