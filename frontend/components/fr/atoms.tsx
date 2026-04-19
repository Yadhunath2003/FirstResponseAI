"use client";

import { cn } from "@/lib/utils";

/* ── Color tokens for inline style use ─────────────────────── */
export const FR = {
  bg: "#000000",
  panel: "#111111",
  card: "#1a1a1a",
  border: "#333333",
  borderStrong: "#555555",
  text: "#ffffff",
  sub: "#888888",
  dim: "#555555",
  red: "#e74c3c",
  orange: "#f39c12",
  green: "#2ecc71",
  blue: "#3498db",
  purple: "#9b59b6",
} as const;

export const TYPE_META: Record<string, { label: string; color: string }> = {
  structure_fire: { label: "Structure Fire", color: FR.red },
  mci: { label: "Mass Casualty", color: FR.orange },
  hazmat: { label: "Hazmat", color: FR.purple },
  rescue: { label: "Rescue", color: FR.blue },
  other: { label: "Other", color: FR.sub },
};

export const PRIORITY_META: Record<string, { label: string; short: string; color: string }> = {
  emergency: { label: "P1 EMERGENCY", short: "P1", color: FR.red },
  urgent: { label: "P2 URGENT", short: "P2", color: FR.orange },
  routine: { label: "P3 ROUTINE", short: "P3", color: FR.green },
};

/* ── Solid colored square ──────────────────────────────────── */
export function SolidSquare({
  color,
  size = 8,
  className,
  style,
}: {
  color: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size, background: color, ...style }}
    />
  );
}

/* ── Connection indicator ──────────────────────────────────── */
export function ConnSquare({
  connected = true,
  label = true,
}: {
  connected?: boolean;
  label?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <SolidSquare
        color={connected ? FR.green : FR.red}
        size={8}
        className={connected ? "fr-conn-live" : ""}
      />
      {label && (
        <span className="font-mono text-[10px] tracking-[0.06em]" style={{ color: FR.sub }}>
          {connected ? "ONLINE" : "OFFLINE"}
        </span>
      )}
    </span>
  );
}

/* ── Type badge ────────────────────────────────────────────── */
export function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const m = TYPE_META[type] || TYPE_META.other;
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-[0.06em] whitespace-nowrap",
        small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
      )}
      style={{
        background: m.color + "22",
        border: `1px solid ${m.color}55`,
        color: m.color,
      }}
    >
      {m.label}
    </span>
  );
}

/* ── Status badge ──────────────────────────────────────────── */
export function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  const color = active ? FR.blue : FR.sub;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em]"
      style={{
        background: active ? "#3498db18" : "#33333344",
        border: `1px solid ${active ? "#3498db55" : "#444"}`,
        color,
      }}
    >
      <SolidSquare color={color} size={5} className="!rounded-full" style={{ borderRadius: "50%" }} />
      {active ? "ACTIVE" : "CLOSED"}
    </span>
  );
}

/* ── Priority badge ────────────────────────────────────────── */
export function PriorityBadge({ priority, short }: { priority: string; short?: boolean }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.routine;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap"
      style={{
        background: m.color + "1a",
        border: `1px solid ${m.color}44`,
        color: m.color,
      }}
    >
      {short ? m.short : m.label}
    </span>
  );
}

/* ── Section label ─────────────────────────────────────────── */
export function FrLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] font-semibold uppercase tracking-[0.1em]",
        className,
      )}
      style={{ color: FR.sub }}
    >
      {children}
    </span>
  );
}