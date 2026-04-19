"use client";

import { Mic, MicOff, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileState = "idle" | "starting" | "recording" | "sending";

interface ChannelMicTileProps {
  label: string;
  desc: string;
  isTuned: boolean;
  state: TileState;
  unread: number;
  disabled?: boolean;
  onTap: () => void;
}

export function ChannelMicTile({
  label,
  desc,
  isTuned,
  state,
  unread,
  disabled,
  onTap,
}: ChannelMicTileProps) {
  const active = state === "recording" || state === "starting";
  const sending = state === "sending";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onTap}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 min-h-36 select-none touch-manipulation transition-all disabled:opacity-50",
        active
          ? "bg-destructive text-destructive-foreground border-destructive ring-4 ring-destructive/30 scale-[1.02]"
          : isTuned
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-card-foreground border-border hover:border-primary/50",
      )}
    >
      {isTuned && !active && (
        <Radio className="absolute top-2 left-2 size-3.5 opacity-80" />
      )}
      {unread > 0 && !active && (
        <span className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}

      {sending ? (
        <Loader2 className="size-10 animate-spin" />
      ) : active ? (
        <Mic className="size-10 animate-pulse" />
      ) : (
        <MicOff className="size-9" />
      )}

      <div className="flex flex-col items-center text-center">
        <span className="font-semibold text-base leading-tight">{label}</span>
        <span className={cn("text-xs leading-tight mt-0.5", active ? "opacity-90 font-medium" : "opacity-75")}>
          {active ? "Tap to stop" : sending ? "Sending…" : desc}
        </span>
      </div>
    </button>
  );
}
