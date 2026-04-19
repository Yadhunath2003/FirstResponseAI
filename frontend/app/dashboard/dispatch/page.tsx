"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IncidentMap } from "@/components/incident-map";
import {
  FR,
  SolidSquare,
  TypeBadge,
  PriorityBadge,
  FrLabel,
  TYPE_META,
  PRIORITY_META,
} from "@/components/fr/atoms";
import {
  ArrowLeft,
  AlertCircle,
  Users,
  FileText,
  Search,
  Crosshair,
  Flame,
  Cross,
} from "lucide-react";
import type { DispatchParsed } from "@/lib/types";
import { toast } from "sonner";

const TYPES = [
  { value: "structure_fire", label: "Structure Fire", Icon: Flame, color: FR.red },
  { value: "mci", label: "Mass Casualty", Icon: Users, color: FR.orange },
  { value: "hazmat", label: "Hazmat", Icon: AlertCircle, color: FR.purple },
  { value: "rescue", label: "Rescue", Icon: Cross, color: FR.blue },
  { value: "other", label: "Other", Icon: FileText, color: FR.sub },
];

const PRIORITIES = [
  { value: "emergency", label: "P1 EMERGENCY", color: FR.red },
  { value: "urgent", label: "P2 URGENT", color: FR.orange },
  { value: "routine", label: "P3 ROUTINE", color: FR.green },
];

export default function CallTakerPage() {
  const router = useRouter();
  const [form, setForm] = useState<DispatchParsed>({
    incident_type: "",
    priority: "emergency",
    description: "",
    notes: "",
    location_lat: null,
    location_lng: null,
    location_display: null,
    address: "",
    units_mentioned: [],
  });
  const [locSearch, setLocSearch] = useState("");
  const [locResults, setLocResults] = useState <
    { place_id: string; lat: string; lon: string; display_name: string }[]
  >([]);
  const [locLoading, setLocLoading] = useState(false);

  const set = <K extends keyof DispatchParsed>(k: K, v: DispatchParsed[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const searchLocation = async () => {
    if (locSearch.trim().length < 3) return;
    setLocLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          locSearch,
        )}&format=json&limit=5`,
      );
      setLocResults(await res.json());
    } catch {
      toast.error("Location lookup failed");
      setLocResults([]);
    } finally {
      setLocLoading(false);
    }
  };

  const pickLocation = (r: { lat: string; lon: string; display_name: string }) => {
    set("location_lat", parseFloat(r.lat));
    set("location_lng", parseFloat(r.lon));
    set("location_display", r.display_name);
    set("address", r.display_name);
    setLocSearch(r.display_name.split(",").slice(0, 2).join(","));
    setLocResults([]);
  };

  const useMyLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const disp = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        set("location_lat", pos.coords.latitude);
        set("location_lng", pos.coords.longitude);
        set("location_display", disp);
        set("address", disp);
        toast.success("Location captured");
      },
      () => toast.error("Could not get location"),
    );
  };

  const canSubmit = !!form.incident_type && form.location_lat !== null;

  const confirm = useMutation({
    mutationFn: () => api.confirmDispatch(form),
    onSuccess: (inc) => {
      toast.success(`Incident created: ${inc.name}`);
      router.push(`/dashboard/${inc.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const previewCenter: [number, number] = form.location_lat
    ? [form.location_lat, form.location_lng!]
    : [38.9592, -95.2453];

  return (
    <div
      className="h-[100dvh] flex flex-col overflow-hidden"
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
          onMouseEnter={(e) => {
            e.currentTarget.style.color = FR.text;
            e.currentTarget.style.background = FR.card;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = FR.sub;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div
          className="flex-1 px-4 py-3"
          style={{ borderLeft: `3px solid ${FR.red}` }}
        >
          <div className="text-sm font-semibold text-white leading-tight">
            Call Taker Intake
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: FR.sub }}>
            New 911 incident — complete all required fields
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderLeft: `1px solid ${FR.border}` }}
        >
          <SolidSquare
            color={FR.red}
            size={8}
            className="fr-conn-live"
            style={{ borderRadius: "50%" }}
          />
          <span
            className="text-[11px] hidden sm:inline"
            style={{ color: FR.sub }}
          >
            Live line
          </span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-0">
        {/* LEFT — Form */}
        <div
          className="overflow-y-auto"
          style={{
            background: FR.bg,
            borderRight: `1px solid ${FR.border}`,
          }}
        >
          {/* Incident Type */}
          <Section>
            <FrLabel className="mb-2.5 block">Incident Type *</FrLabel>
            <div
              className="grid grid-cols-3"
              style={{ border: `1px solid ${FR.border}` }}
            >
              {TYPES.map((t, i) => {
                const sel = form.incident_type === t.value;
                const { Icon } = t;
                return (
                  <button
                    key={t.value}
                    onClick={() => set("incident_type", t.value)}
                    className="flex flex-col items-center gap-1.5 px-2 py-3 text-[11px] font-semibold text-center transition-colors"
                    style={{
                      background: sel ? "#fff" : FR.card,
                      color: sel ? "#000" : FR.sub,
                      borderRight:
                        i % 3 < 2 ? `1px solid ${FR.border}` : "none",
                      borderBottom:
                        i < 3 ? `1px solid ${FR.border}` : "none",
                    }}
                  >
                    <Icon size={16} style={{ color: sel ? "#000" : t.color }} />
                    <span className="tracking-[0.04em] leading-tight">
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Priority */}
          <Section>
            <FrLabel className="mb-2.5 block">Priority *</FrLabel>
            <div
              className="grid grid-cols-3"
              style={{ border: `1px solid ${FR.border}` }}
            >
              {PRIORITIES.map((p, i) => {
                const sel = form.priority === p.value;
                return (
                  <button
                    key={p.value}
                    onClick={() => set("priority", p.value)}
                    className="px-1.5 py-3 font-mono text-[10px] font-bold tracking-[0.06em] transition-colors"
                    style={{
                      background: sel ? p.color : FR.card,
                      color: sel ? "#000" : p.color,
                      borderRight:
                        i < 2 ? `1px solid ${FR.border}` : "none",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Location */}
          <Section>
            <FrLabel className="mb-2.5 block">
              Location <span style={{ color: FR.red }}>*</span>
            </FrLabel>

            <div
              className="flex mb-2"
              style={{ border: `1px solid ${FR.border}` }}
            >
              <input
                value={locSearch}
                onChange={(e) => setLocSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchLocation()}
                placeholder="Search address or cross-street…"
                className="flex-1 px-3 py-2.5 text-[13px] outline-none placeholder:text-[#444]"
                style={{
                  background: "#0a0a0a",
                  color: FR.text,
                  border: "none",
                  borderRight: `1px solid ${FR.border}`,
                }}
              />
              <button
                onClick={searchLocation}
                className="px-3.5 transition-colors flex items-center"
                style={{ background: FR.card, color: FR.sub }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#2a2a2a")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = FR.card)
                }
              >
                {locLoading ? (
                  <span
                    className="block w-3 h-3 rounded-full"
                    style={{
                      border: `2px solid ${FR.borderStrong}`,
                      borderTopColor: "#fff",
                      animation: "spin 0.6s linear infinite",
                    }}
                  />
                ) : (
                  <Search size={14} />
                )}
              </button>
            </div>

            {locResults.length > 0 && (
              <div
                className="mb-2"
                style={{
                  background: FR.panel,
                  border: `1px solid ${FR.border}`,
                  borderTop: "none",
                }}
              >
                {locResults.map((r: { place_id: string; lat: string; lon: string; display_name: string }, i: number) => (
                  <button
                    key={r.place_id}
                    onClick={() => pickLocation(r)}
                    className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                    style={{
                      color: FR.sub,
                      borderBottom:
                        i < locResults.length - 1
                          ? `1px solid ${FR.border}`
                          : "none",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = FR.card;
                      e.currentTarget.style.color = FR.text;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = FR.sub;
                    }}
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}

            {form.location_display && (
              <div
                className="p-2.5 mb-2 flex items-start gap-2"
                style={{
                  background: "#0d2c1a",
                  border: `1px solid ${FR.green}`,
                }}
              >
                <SolidSquare
                  color={FR.green}
                  size={8}
                  style={{ marginTop: 3 }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="font-mono text-[11px] leading-[1.4] break-words"
                    style={{ color: FR.green }}
                  >
                    {form.location_display}
                  </div>
                  {form.location_lat && (
                    <div
                      className="font-mono text-[10px] mt-0.5"
                      style={{ color: FR.green + "aa" }}
                    >
                      {form.location_lat.toFixed(5)},{" "}
                      {form.location_lng!.toFixed(5)}
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={useMyLocation}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[11px] font-semibold tracking-[0.06em] transition-colors"
              style={{
                background: FR.card,
                border: `1px solid ${FR.border}`,
                color: FR.sub,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = FR.borderStrong;
                e.currentTarget.style.color = FR.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = FR.border;
                e.currentTarget.style.color = FR.sub;
              }}
            >
              <Crosshair size={14} />
              USE MY LOCATION
            </button>
          </Section>

          {/* Description */}
          <Section>
            <FrLabel className="mb-2.5 block">Description</FrLabel>
            <input
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Three-story wood frame, possible entrapment"
              className="w-full px-3 py-2.5 text-[13px] outline-none placeholder:text-[#444]"
              style={{
                background: "#0a0a0a",
                color: FR.text,
                border: `1px solid ${FR.border}`,
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = FR.borderStrong)
              }
              onBlur={(e) => (e.currentTarget.style.borderColor = FR.border)}
            />
          </Section>

          {/* Caller Notes */}
          <Section>
            <FrLabel className="mb-2.5 block">Caller Notes</FrLabel>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Hazards, suspect description, medical status, caller name…"
              rows={4}
              className="w-full px-3 py-2.5 font-mono text-[12px] outline-none placeholder:text-[#444] resize-y"
              style={{
                background: "#0a0a0a",
                color: FR.text,
                border: `1px solid ${FR.border}`,
                minHeight: 72,
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = FR.borderStrong)
              }
              onBlur={(e) => (e.currentTarget.style.borderColor = FR.border)}
            />
          </Section>

          {/* Submit */}
          <div className="p-4">
            <button
              onClick={() => confirm.mutate()}
              disabled={!canSubmit || confirm.isPending}
              className="w-full py-3.5 font-mono text-[12px] font-bold tracking-[0.1em] transition-colors"
              style={{
                background: canSubmit ? FR.red : FR.card,
                color: canSubmit ? "#fff" : FR.dim,
                border: `1px solid ${canSubmit ? "#fff" : FR.border}`,
                cursor:
                  canSubmit && !confirm.isPending ? "pointer" : "not-allowed",
              }}
            >
              {confirm.isPending
                ? "CREATING INCIDENT…"
                : "CREATE INCIDENT"}
            </button>
          </div>
        </div>

        {/* RIGHT — Live Preview */}
        <div
          className="overflow-y-auto"
          style={{ background: "#080808" }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${FR.border}` }}
          >
            <FrLabel>LIVE PREVIEW</FrLabel>
            <div className="flex gap-1.5 items-center">
              {form.incident_type && (
                <TypeBadge type={form.incident_type} small />
              )}
              {form.priority && (
                <PriorityBadge priority={form.priority} short />
              )}
            </div>
          </div>

          {/* Preview card */}
          <div className="p-4">
            <div
              style={{
                background: FR.card,
                border: `1px solid ${FR.border}`,
              }}
            >
              {/* Card header */}
              <div
                className="px-4 py-3"
                style={{ borderBottom: `1px solid ${FR.border}` }}
              >
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.priority && <PriorityBadge priority={form.priority} />}
                </div>
                <div className="text-[15px] font-bold text-white mb-1">
                  {form.description || (
                    <span style={{ color: "#444" }}>
                      Incident description…
                    </span>
                  )}
                </div>
                <div
                  className="text-[12px] flex items-center gap-1.5"
                  style={{ color: FR.sub }}
                >
                  {form.location_display || (
                    <span style={{ color: "#333" }}>No location selected</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div
                className="px-4 py-3"
                style={{ borderBottom: `1px solid ${FR.border}` }}
              >
                <div
                  className="font-mono text-[10px] tracking-[0.08em] mb-1.5"
                  style={{ color: FR.dim }}
                >
                  CALLER NOTES
                </div>
                <div
                  className="font-mono text-[11px] leading-relaxed"
                  style={{ color: form.notes ? "#bbb" : "#333" }}
                >
                  {form.notes || "No notes entered"}
                </div>
              </div>

              {/* Map preview */}
              <div className="h-[240px]">
                <IncidentMap center={previewCenter} interactive={false} />
              </div>
            </div>

            {/* Field summary table */}
            <div
              className="mt-4"
              style={{
                background: FR.panel,
                border: `1px solid ${FR.border}`,
              }}
            >
              {[
                {
                  label: "TYPE",
                  value: form.incident_type
                    ? TYPE_META[form.incident_type]?.label
                    : null,
                },
                {
                  label: "PRIORITY",
                  value: form.priority
                    ? PRIORITY_META[form.priority]?.label
                    : null,
                },
                { label: "ADDRESS", value: form.address || null, mono: true },
                {
                  label: "COORDS",
                  value:
                    form.location_lat !== null
                      ? `${form.location_lat!.toFixed(5)}, ${form.location_lng!.toFixed(5)}`
                      : null,
                  mono: true,
                },
              ].map((f, i) => (
                <div
                  key={f.label}
                  className="flex justify-between items-center gap-4 px-4 py-2.5"
                  style={{
                    borderBottom:
                      i < 3 ? `1px solid ${FR.border}` : "none",
                  }}
                >
                  <span
                    className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] shrink-0"
                    style={{ color: FR.dim }}
                  >
                    {f.label}
                  </span>
                  <span
                    className={`text-right break-all ${f.mono ? "font-mono text-[11px]" : "text-[12px]"}`}
                    style={{
                      color: f.value ? "#ccc" : "#333",
                      maxWidth: "60%",
                    }}
                  >
                    {f.value || "—"}
                  </span>
                </div>
              ))}
            </div>

            {!canSubmit && (
              <div
                className="mt-4 px-3 py-2.5"
                style={{
                  background: "#1a1200",
                  border: `1px solid ${FR.orange}`,
                }}
              >
                <span
                  className="font-mono text-[11px]"
                  style={{ color: FR.orange }}
                >
                  Incident type and location required before creating.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-3.5"
      style={{ borderBottom: `1px solid ${FR.border}` }}
    >
      {children}
    </div>
  );
}