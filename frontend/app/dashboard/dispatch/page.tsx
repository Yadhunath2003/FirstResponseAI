"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IncidentMap } from "@/components/incident-map";
import { ArrowLeft, Search, MapPin } from "lucide-react";
import type { DispatchParsed } from "@/lib/types";
import { toast } from "sonner";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  emergency: "destructive",
  urgent: "default",
  routine: "secondary",
};

const INCIDENT_TYPES = [
  { value: "structure_fire", label: "Structure Fire" },
  { value: "mci", label: "Mass Casualty (MCI)" },
  { value: "hazmat", label: "Hazmat" },
  { value: "rescue", label: "Rescue" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "emergency", label: "P1 — Emergency", color: "text-red-500" },
  { value: "urgent", label: "P2 — Urgent", color: "text-orange-400" },
  { value: "routine", label: "P3 — Routine", color: "text-green-400" },
];

export default function DispatchPage() {
  const router = useRouter();
  const [parsed, setParsed] = useState<DispatchParsed>({
    incident_type: "",
    address: "",
    description: "",
    notes: "",
    priority: "emergency",
    units_mentioned: [],
    location_lat: null,
    location_lng: null,
    location_display: null,
  });

  const confirm = useMutation({
    mutationFn: () => api.confirmDispatch(parsed!),
    onSuccess: (incident) => {
      toast.success(`Incident created: ${incident.name}`);
      router.push(`/dashboard/${incident.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const canConfirm =
    parsed.incident_type &&
    parsed.address &&
    parsed.location_lat !== null &&
    parsed.location_lng !== null;

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto w-full">
      <header className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">New Incident — Call Intake</h1>
          <p className="text-sm text-muted-foreground">
            Enter incident details from the 911 call. Location is required.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT — Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incident Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Incident Type */}
            <div className="space-y-1.5">
              <Label>Incident Type *</Label>
              <div className="grid grid-cols-2 gap-2">
                {INCIDENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setParsed((p) => ({ ...p, incident_type: t.value }))}
                    className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left
                      ${parsed.incident_type === t.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background hover:border-foreground/40"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <Label>Priority *</Label>
              <div className="flex gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    suppressHydrationWarning
                    onClick={() => setParsed((prev) => ({ ...prev, priority: p.value }))}
                    className={`flex-1 rounded-md border px-2 py-2 text-xs font-semibold transition-colors
                      ${parsed.priority === p.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background hover:border-foreground/40"
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location search */}
            <div className="space-y-1.5">
              <Label>Location * <span className="text-muted-foreground font-normal">(most critical)</span></Label>
              <LocationSearch
                onPick={(lat, lng, display, address) =>
                  setParsed((p) => ({
                    ...p,
                    location_lat: lat,
                    location_lng: lng,
                    location_display: display,
                    address: address,
                  }))
                }
              />
              {parsed.location_display && (
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <MapPin className="size-3" /> {parsed.location_display}
                </p>
              )}
            </div>

            {/* Use My Location */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    setParsed((p) => ({
                      ...p,
                      location_lat: pos.coords.latitude,
                      location_lng: pos.coords.longitude,
                      location_display: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
                      address: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`,
                    }));
                    toast.success("Location captured");
                  },
                  () => toast.error("Could not get location"),
                );
              }}
            >
              <MapPin className="size-3.5 mr-1" /> Use My Location
            </Button>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={parsed.description ?? ""}
                onChange={(e) => setParsed((p) => ({ ...p, description: e.target.value }))}
                placeholder="e.g. Three-story building, possible entrapment"
              />
            </div>

            {/* Caller Notes */}
            <div className="space-y-1.5">
              <Label>Caller Notes</Label>
              <textarea
                value={parsed.notes ?? ""}
                onChange={(e) => setParsed((p) => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-md border bg-background p-2 text-sm resize-none"
                placeholder="Suspect description, medical status, hazards..."
              />
            </div>

          </CardContent>
        </Card>

        {/* RIGHT — Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Incident Preview
              {parsed.priority && (
                <Badge variant={PRIORITY_VARIANT[parsed.priority] ?? "default"}>
                  {parsed.priority.toUpperCase()}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">

            <Field label="Type" value={parsed.incident_type?.replace(/_/g, " ") ?? "—"} />
            <Field label="Address" value={parsed.address ?? "—"} />
            <Field label="Description" value={parsed.description ?? "—"} />
            <Field label="Notes" value={parsed.notes ?? "—"} />
            <Field
              label="Coordinates"
              value={
                parsed.location_lat && parsed.location_lng
                  ? `${parsed.location_lat.toFixed(4)}, ${parsed.location_lng.toFixed(4)}`
                  : "Not set"
              }
            />

            {parsed.location_lat && parsed.location_lng && (
              <div className="h-52 rounded-md overflow-hidden border mt-2">
                <IncidentMap
                  center={[parsed.location_lat, parsed.location_lng]}
                  interactive={false}
                />
              </div>
            )}

            {!canConfirm && (
              <p className="text-xs text-amber-400">
                Incident type and location are required before creating.
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!canConfirm || confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {confirm.isPending ? "Creating incident…" : "🚨 Create Incident"}
            </Button>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

function LocationSearch({
  onPick,
}: {
  onPick: (lat: number, lng: number, display: string, address: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ lat: string; lon: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (q.trim().length < 3) return;
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`;
      const res = await fetch(url);
      const items = await res.json();
      setResults(items);
    } catch {
      toast.error("Geocoding lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder="Search address — press Enter"
          autoFocus
        />
        <Button variant="outline" size="sm" disabled={loading} suppressHydrationWarning onClick={search}>
          <Search className="size-3.5" />
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="rounded-md border divide-y max-h-40 overflow-y-auto">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lon}`}>
              <button
                type="button"
                suppressHydrationWarning
                className="w-full text-left p-2 text-xs hover:bg-muted"
                onClick={() => {
                  onPick(parseFloat(r.lat), parseFloat(r.lon), r.display_name, r.display_name);
                  setResults([]);
                  setQ(r.display_name);
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}