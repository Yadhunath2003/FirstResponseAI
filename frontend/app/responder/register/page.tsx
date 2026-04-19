"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { FR, FrLabel, SolidSquare } from "@/components/fr/atoms";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { UnitType } from "@/lib/types";

const UNIT_TYPES: { value: UnitType; label: string; accent: string }[] = [
  { value: "engine", label: "Engine", accent: FR.red },
  { value: "ladder", label: "Ladder", accent: FR.orange },
  { value: "medic", label: "Medic", accent: FR.green },
  { value: "battalion_chief", label: "Battalion", accent: FR.blue },
  { value: "division", label: "Division", accent: FR.purple },
  { value: "staging", label: "Staging", accent: FR.sub },
  { value: "command", label: "Command", accent: FR.red },
];

export default function RegisterPage() {
  const router = useRouter();
  const { deviceId, setUnit } = useSession();
  const [unitType, setUnitType] = useState<UnitType>("engine");
  const [unitNumber, setUnitNumber] = useState("");

  const register = useMutation({
    mutationFn: () =>
      api.registerUnit({
        unit_type: unitType,
        unit_number: unitNumber,
        device_id: deviceId,
      }),
    onSuccess: (data) => {
      setUnit({
        unitId: data.unit_id,
        callsign: data.callsign,
        unitType,
        unitNumber,
      });
      toast.success(`Registered as ${data.callsign}`);
      router.push("/responder/incidents");
    },
    onError: (err) => toast.error(`Registration failed: ${err.message}`),
  });

  const needsNumber = !["command", "staging"].includes(unitType);
  const canSubmit = !needsNumber || unitNumber.trim().length > 0;

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
          href="/responder"
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
        <div className="flex-1 px-4 py-3">
          <div className="text-sm font-semibold text-white leading-tight">
            Field Responder
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: FR.sub }}>
            Mobile unit interface
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderLeft: `1px solid ${FR.border}` }}
        >
          <SolidSquare
            color={FR.green}
            size={7}
            className="fr-conn-live"
            style={{ borderRadius: "50%" }}
          />
        </div>
      </header>

      {/* Title */}
      <div className="px-5 py-6">
        <h1 className="text-[26px] font-bold tracking-tight text-white mb-1">
          Unit Registration
        </h1>
        <p className="text-[13px]" style={{ color: FR.sub }}>
          Select your unit type to join an incident.
        </p>
      </div>

      {/* Unit type grid */}
      <div className="px-5 mb-5">
        <FrLabel className="block mb-3">UNIT TYPE</FrLabel>
        <div className="grid grid-cols-2 gap-2.5">
          {UNIT_TYPES.map((t, i) => {
            const sel = unitType === t.value;
            const isLastOdd =
              UNIT_TYPES.length % 2 === 1 && i === UNIT_TYPES.length - 1;
            return (
              <button
                key={t.value}
                onClick={() => setUnitType(t.value)}
                className="py-5 px-3 text-[15px] font-semibold transition-colors"
                style={{
                  background: sel ? t.accent + "22" : FR.card,
                  color: sel ? t.accent : FR.sub,
                  border: `1px solid ${sel ? t.accent + "88" : FR.border}`,
                  gridColumn: isLastOdd ? "1 / -1" : undefined,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unit number */}
      {needsNumber && (
        <div className="px-5 mb-5">
          <FrLabel className="block mb-3">UNIT NUMBER</FrLabel>
          <input
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
            placeholder="e.g. 7"
            autoComplete="off"
            className="w-full px-4 py-4 text-[20px] text-center outline-none placeholder:text-[#333]"
            style={{
              background: "#0a0a0a",
              color: FR.text,
              border: `1px solid ${FR.border}`,
              fontFamily: "var(--font-plex-mono), monospace",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = FR.borderStrong)
            }
            onBlur={(e) => (e.currentTarget.style.borderColor = FR.border)}
          />
        </div>
      )}

      {/* Register button */}
      <div className="px-5 mt-auto mb-8">
        <button
          onClick={() => register.mutate()}
          disabled={!canSubmit || register.isPending}
          className="w-full py-4 font-mono text-[13px] font-bold tracking-[0.1em] transition-colors"
          style={{
            background: canSubmit ? FR.red : FR.card,
            color: canSubmit ? "#fff" : FR.dim,
            border: `1px solid ${canSubmit ? "#fff" : FR.border}`,
            cursor:
              canSubmit && !register.isPending ? "pointer" : "not-allowed",
          }}
        >
          {register.isPending ? "REGISTERING…" : "REGISTER UNIT →"}
        </button>
      </div>
    </div>
  );
}