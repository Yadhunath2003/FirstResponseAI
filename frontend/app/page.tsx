"use client";

import Link from "next/link";
import { useState } from "react";
import { Phone, MapPin, Radio, ArrowRight } from "lucide-react";
import { ConnSquare, SolidSquare, FR } from "@/components/fr/atoms";

const ROLES = [
  {
    key: "calltaker",
    href: "/dashboard/dispatch",
    Icon: Phone,
    label: "Call Taker",
    desc: "911 intake — capture caller info, classify incident type, geocode location, and create a new dispatch record.",
    accent: FR.red,
    cta: "Open Call Intake",
  },
  {
    key: "dispatcher",
    href: "/dashboard",
    Icon: MapPin,
    label: "Dispatcher",
    desc: "Operations center — monitor active incidents, assign units, review zone suggestions, and track field communications.",
    accent: FR.blue,
    cta: "Open Dispatch",
  },
  {
    key: "responder",
    href: "/responder",
    Icon: Radio,
    label: "Field Responder",
    desc: "Mobile unit — register your apparatus, join an active incident, monitor channels, and use push-to-talk radio.",
    accent: FR.green,
    cta: "Open Responder",
  },
];

const STATS = [
  { label: "ACTIVE INCIDENTS", value: "4", color: FR.red },
  { label: "UNITS DEPLOYED", value: "18", color: FR.orange },
  { label: "OPEN CHANNELS", value: "6", color: FR.green },
  { label: "PENDING ACTIONS", value: "2", color: FR.blue },
];

export default function Landing() {
  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
      style={{ background: FR.bg }}
    >
      {/* Top bar */}
      <header
        className="flex items-center justify-between px-6 py-3.5 shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 flex items-center justify-center text-[13px] font-bold"
            style={{ background: FR.red, color: "#fff" }}
          >
            FR
          </div>
          <span className="text-sm font-semibold text-white">FirstResponse AI</span>
          <span
            className="px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide uppercase"
            style={{ background: FR.card, border: `1px solid ${FR.border}`, color: FR.sub }}
          >
            V2.4
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SolidSquare color={FR.green} size={7} className="fr-conn-live" style={{ borderRadius: "50%" }} />
          <span className="text-[11px]" style={{ color: FR.sub }}>All systems operational</span>
        </div>
      </header>

      {/* Center */}
      <main className="flex-1 flex flex-col items-center justify-center gap-10 overflow-auto px-6 py-8">
        <div className="text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3 leading-none">
            FirstResponse AI
          </h1>
          <p className="text-sm" style={{ color: FR.sub }}>
            Select your role to enter the platform
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-5xl">
          {ROLES.map((role) => (
            <RoleCard key={role.key} role={role} />
          ))}
        </div>

        {/* Stats strip */}
        <div
          className="flex flex-wrap items-stretch"
          style={{ background: FR.panel, border: `1px solid ${FR.border}` }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="min-w-[130px] text-center py-3 px-6"
              style={{
                borderRight: i < STATS.length - 1 ? `1px solid ${FR.border}` : "none",
              }}
            >
              <div
                className="text-[26px] font-bold leading-none tracking-tight mb-1 tabular-nums"
                style={{ color: s.color }}
              >
                {s.value}
              </div>
              <div className="text-[10px] tracking-[0.1em]" style={{ color: FR.sub }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer
        className="flex items-center justify-between px-6 py-2.5 shrink-0 flex-wrap gap-2"
        style={{ borderTop: `1px solid ${FR.border}` }}
      >
        <span className="font-mono text-[11px]" style={{ color: FR.dim }}>
          API: {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
        </span>
        <span className="text-[11px]" style={{ color: FR.dim }}>
          © 2026 FirstResponse AI — Computer-Aided Dispatch Platform
        </span>
      </footer>
    </div>
  );
}

function RoleCard({
  role,
}: {
  role: (typeof ROLES)[number];
}) {
  const [hov, setHov] = useState(false);
  const { Icon } = role;

  return (
    <Link
      href={role.href}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="relative flex flex-col p-6 outline-none transition-all duration-200 cursor-pointer"
      style={{
        background: hov ? "#1f1f1f" : FR.card,
        border: `1px solid ${hov ? role.accent + "88" : "#2a2a2a"}`,
        transform: hov ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: role.accent }}
      />

      {/* Icon */}
      <div
        className="w-[52px] h-[52px] flex items-center justify-center mb-4"
        style={{
          background: role.accent + "18",
          border: `1px solid ${role.accent}33`,
        }}
      >
        <Icon size={26} style={{ color: role.accent }} strokeWidth={1.5} />
      </div>

      {/* Title + desc */}
      <div className="mb-5 flex-1">
        <div className="text-lg font-bold text-white tracking-tight mb-1.5">
          {role.label}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: FR.sub }}>
          {role.desc}
        </p>
      </div>

      {/* CTA row */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: role.accent }}
        >
          {role.cta}
        </span>
        <ArrowRight size={16} style={{ color: role.accent }} strokeWidth={2} />
      </div>
    </Link>
  );
}