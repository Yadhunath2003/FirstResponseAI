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
  const stateRef = useRef<State>("idle");

  const setStateSync = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  const start = useCallback(async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (stateRef.current !== "idle" || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setStateSync("starting");
    try {
      handleRef.current = await startPTT({ onInterim });
      setStateSync("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Microphone error: ${msg}`);
      setStateSync("idle");
    }
  }, [disabled, onInterim]);

  const stop = useCallback(async () => {
    if (stateRef.current === "starting") {
      setTimeout(stop, 50);
      return;
    }
    if (stateRef.current !== "recording" || !handleRef.current) return;
    setStateSync("sending");
    try {
      const result = await handleRef.current.stop();
      handleRef.current = null;
      await onResult(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice send failed");
    } finally {
      setStateSync("idle");
    }
  }, [onResult]);

  const active = state === "recording" || state === "starting";

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        start(e);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
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
          {state === "recording"
            ? "Recording"
            : state === "sending"
              ? "Sending"
              : state === "starting"
                ? "…"
                : label}
        </span>
      </div>
    </button>
  );
}