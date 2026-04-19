"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";
import { FR, FrLabel, SolidSquare } from "@/components/fr/atoms";
import { ArrowLeft, Radio, ListTodo, UserPlus } from "lucide-react";

export default function ResponderHome() {
  const { callsign, unitId, unitType } = useSession();

  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: FR.bg }}
    >
      {/* Header */}
      <header
        className="flex items-stretch shrink-0"
        style={{ borderBottom: `1px solid ${FR.border}` }}
      >
        <Link
          href="/"
          className="flex items-center px-4 py-3 transition-colors"
          style={{
            borderRight: `1px solid ${FR.border}`,
            color: FR.sub,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = FR.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = FR.sub)}
        >
          <ArrowLeft size={16} />
        </Link>
        <div
          className="flex-1 px-4 py-3"
          style={{ borderLeft: `3px solid ${FR.green}` }}
        >
          <div className="text-sm font-semibold text-white leading-tight">
            Field Responder
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: FR.sub }}>
            Mobile unit interface
          </div>
        </div>
      </header>

      {/* Unit status card */}
      <div className="p-5">
        <div
          className="p-4"
          style={{
            background: FR.card,
            border: `1px solid ${FR.border}`,
          }}
        >
          <FrLabel className="block mb-2">UNIT STATUS</FrLabel>
          {unitId ? (
            <>
              <div className="flex items-center gap-2.5 mb-3">
                <SolidSquare
                  color={FR.green}
                  size={10}
                  className="fr-conn-live"
                  style={{ borderRadius: "50%" }}
                />
                <span
                  className="font-mono text-[20px] font-bold tracking-tight text-white"
                >
                  {callsign}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <div>
                  <span className="font-mono uppercase tracking-wide" style={{ color: FR.dim }}>
                    Type
                  </span>
                  <div style={{ color: FR.text }}>
                    {unitType?.replace(/_/g, " ")}
                  </div>
                </div>
                <div>
                  <span className="font-mono uppercase tracking-wide" style={{ color: FR.dim }}>
                    State
                  </span>
                  <div style={{ color: FR.green }}>Registered</div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5">
              <SolidSquare
                color={FR.orange}
                size={10}
                style={{ borderRadius: "50%" }}
              />
              <span
                className="font-mono text-[15px] font-semibold tracking-wide"
                style={{ color: FR.orange }}
              >
                NOT REGISTERED
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 space-y-3">
        {!unitId && (
          <ActionCard
            href="/responder/register"
            Icon={UserPlus}
            title="Register Unit"
            desc="Set your unit type and number to start receiving dispatch."
            accent={FR.red}
          />
        )}
        <ActionCard
          href="/responder/incidents"
          Icon={ListTodo}
          title="Browse Incidents"
          desc="See active incidents and join the one you're responding to."
          accent={FR.blue}
          disabled={!unitId}
        />
        <ActionCard
          href="/responder/register"
          Icon={Radio}
          title={unitId ? "Re-register Unit" : "Re-register"}
          desc="Change your unit type or number."
          accent={FR.sub}
          variant="secondary"
        />
      </div>
    </div>
  );
}

function ActionCard({
  href,
  Icon,
  title,
  desc,
  accent,
  disabled,
  variant = "primary",
}: {
  href: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  title: string;
  desc: string;
  accent: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const body = (
    <div
      className="flex items-start gap-3 p-4 transition-colors"
      style={{
        background: FR.card,
        border: `1px solid ${disabled ? FR.border : variant === "primary" ? accent + "55" : FR.border}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div
        className="w-10 h-10 flex items-center justify-center shrink-0"
        style={{
          background: accent + "18",
          border: `1px solid ${accent}44`,
        }}
      >
        <Icon size={18} style={{ color: accent }} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[14px] font-semibold mb-0.5"
          style={{ color: disabled ? FR.dim : FR.text }}
        >
          {title}
        </div>
        <div className="text-[11px] leading-relaxed" style={{ color: FR.sub }}>
          {desc}
        </div>
      </div>
    </div>
  );

  if (disabled) return body;
  return <Link href={href}>{body}</Link>;
}