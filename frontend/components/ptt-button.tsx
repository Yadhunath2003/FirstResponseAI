"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { startPTT, type PTTHandle, type PTTResult } from "@/lib/audio";
import { toast } from "sonner";

interface PTTButtonProps {
  onResult: (result: PTTResult) => void | Promise<void>;
  onInterim?: (text: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

type State = "idle" | "starting" | "recording" | "sending";

export function PTTButton({
  onResult,
  onInterim,
  disabled,
  label = "Hold to talk",
  className,
}: PTTButtonProps) {
  const [state, setState] = useState<State>("idle");
  const handleRef = useRef<PTTHandle | null>(null);

  const start = useCallback(async () => {
    if (state !== "idle" || disabled) return;
    setState("starting");
    try {
      handleRef.current = await startPTT({ onInterim });
      setState("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Microphone error: ${msg}`);
      setState("idle");
    }
  }, [state, disabled, onInterim]);

  const stop = useCallback(async () => {
    if (state !== "recording" || !handleRef.current) {
      if (state === "starting") {
        // User released before the recorder finished starting. Wait then stop.
        setTimeout(stop, 50);
      }
      return;
    }
    setState("sending");
    try {
      const result = await handleRef.current.stop();
      handleRef.current = null;
      await onResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice send failed");
    } finally {
      setState("idle");
    }
  }, [state, onResult]);

  const busy = state !== "idle";
  const active = state === "recording" || state === "starting";

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={(e) => {
        if (state === "recording") stop();
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "relative flex h-28 w-28 select-none touch-none items-center justify-center rounded-full font-medium transition-all disabled:opacity-50",
        active
          ? "bg-destructive text-destructive-foreground scale-105 ring-4 ring-destructive/30"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1">
        {state === "sending" ? (
          <Loader2 className="size-7 animate-spin" />
        ) : active ? (
          <Mic className="size-7 animate-pulse" />
        ) : (
          <MicOff className="size-7" />
        )}
        <span className="text-[10px] uppercase tracking-wide">
          {state === "recording" ? "Recording" : state === "sending" ? "Sending" : busy ? "…" : label}
        </span>
      </div>
    </button>
  );
}
