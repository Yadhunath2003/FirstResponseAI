"use client";

import { useEffect, useRef, useState } from "react";
import { getWsBase } from "./env";
import type { WSMessage } from "./types";

export type WSStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface UseIncidentSocketOptions {
  incidentId: string | null | undefined;
  unitId: string | null | undefined;
  onMessage?: (msg: WSMessage) => void;
  enabled?: boolean;
}

// Opens ws://HOST/ws/{incidentId}/{unitId} with auto-reconnect.
// Caller passes onMessage for side effects; status is returned for UI.
export function useIncidentSocket({
  incidentId,
  unitId,
  onMessage,
  enabled = true,
}: UseIncidentSocketOptions) {
  const [status, setStatus] = useState<WSStatus>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!enabled || !incidentId || !unitId) return;

    let cancelled = false;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(`${getWsBase()}/ws/${incidentId}/${unitId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as WSMessage;
          handlerRef.current?.(data);
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => setStatus("error");
      ws.onclose = () => {
        setStatus("closed");
        if (cancelled) return;
        // Exponential backoff up to 10s
        const delay = Math.min(1000 * 2 ** attempt++, 10000);
        reconnectRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [incidentId, unitId, enabled]);

  return { status, socket: wsRef };
}
