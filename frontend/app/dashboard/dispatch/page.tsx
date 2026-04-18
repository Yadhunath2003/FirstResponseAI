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
import { PTTButton } from "@/components/ptt-button";
import { IncidentMap } from "@/components/incident-map";
import { ArrowLeft } from "lucide-react";
import type { DispatchParsed } from "@/lib/types";
import type { PTTResult } from "@/lib/audio";
import { toast } from "sonner";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  emergency: "destructive",
  urgent: "default",
  routine: "secondary",
};

export default function DispatchPage() {
  const router = useRouter();
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [parsed, setParsed] = useState<DispatchParsed | null>(null);

  const parse = useMutation({
    mutationFn: (t: string) => api.parseDispatch(t),
    onSuccess: (data) => setParsed(data),
    onError: (e) => toast.error(`Parse failed: ${e.message}`),
  });

  const confirm = useMutation({
    mutationFn: () => api.confirmDispatch(parsed!),
    onSuccess: (incident) => {
      toast.success(`Incident created: ${incident.name}`);
      router.push(`/dashboard/${incident.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handlePTT = async (result: Pick<PTTResult, "transcript">) => {
    setTranscript(result.transcript);
    setInterim("");
    if (result.transcript && result.transcript !== "[no transcript]") {
      parse.mutate(result.transcript);
    }
  };

  const canConfirm =
    parsed &&
    parsed.incident_type &&
    parsed.address &&
    parsed.location_lat !== null &&
    parsed.location_lng !== null;

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto w-full">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Dispatch</h1>
            <p className="text-sm text-muted-foreground">
              Hold the button and speak a dispatch call. AI parses it into an incident.
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <PTTButton
                onResult={handlePTT}
                onInterim={setInterim}
                label="Dispatch"
              />
              {interim && (
                <p className="text-xs text-center italic text-muted-foreground max-w-md">
                  “{interim}”
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="t">Transcript</Label>
              <textarea
                id="t"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={4}
                className="w-full rounded-md border bg-background p-2 text-sm"
                placeholder="Dispatch transcript (voice-captured or typed)"
              />
              <Button
                className="w-full"
                disabled={!transcript.trim() || parse.isPending}
                onClick={() => parse.mutate(transcript)}
              >
                {parse.isPending ? "Parsing…" : "Parse with AI"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Parsed incident
              {parsed?.priority && (
                <Badge variant={PRIORITY_VARIANT[parsed.priority] ?? "default"}>
                  {parsed.priority.toUpperCase()}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!parsed && (
              <p className="text-sm text-muted-foreground">
                No parse yet. Capture or type a transcript, then parse.
              </p>
            )}

            {parsed && (
              <>
                <Field label="Type" value={parsed.incident_type?.replace(/_/g, " ")} />
                <Field label="Address" value={parsed.address ?? "—"} />
                <Field label="Description" value={parsed.description ?? "—"} />
                <Field label="Notes" value={parsed.notes ?? "—"} />
                <Field
                  label="Location"
                  value={
                    parsed.location_display ??
                    (parsed.location_lat && parsed.location_lng
                      ? `${parsed.location_lat.toFixed(4)}, ${parsed.location_lng.toFixed(4)}`
                      : "Not geocoded")
                  }
                />

                {parsed.units_mentioned?.length > 0 && (
                  <div className="space-y-1">
                    <Label>Units mentioned</Label>
                    <div className="flex flex-wrap gap-1">
                      {parsed.units_mentioned.map((u) => (
                        <Badge key={u} variant="outline" className="text-[10px]">
                          {u}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {parsed.location_lat && parsed.location_lng && (
                  <div className="h-48 rounded-md overflow-hidden border mt-2">
                    <IncidentMap
                      center={[parsed.location_lat, parsed.location_lng]}
                      interactive={false}
                    />
                  </div>
                )}

                {!canConfirm && (
                  <p className="text-xs text-amber-400">
                    Location could not be geocoded. Override below.
                  </p>
                )}

                {!canConfirm && (
                  <LocationOverride
                    onPick={(lat, lng, display) =>
                      setParsed({
                        ...parsed,
                        location_lat: lat,
                        location_lng: lng,
                        location_display: display,
                      })
                    }
                  />
                )}

                <Button
                  className="w-full"
                  disabled={!canConfirm || confirm.isPending}
                  onClick={() => confirm.mutate()}
                >
                  {confirm.isPending ? "Creating…" : "Create incident"}
                </Button>
              </>
            )}
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

// Nominatim location override. Hackathon-appropriate: no server-side route needed.
function LocationOverride({
  onPick,
}: {
  onPick: (lat: number, lng: number, display: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ lat: string; lon: string; display_name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (q.trim().length < 3) return;
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q,
      )}&format=json&limit=5`;
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
    <div className="space-y-2">
      <Label>Search address</Label>
      <div className="flex gap-1">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="123 Main St"
        />
        <Button variant="outline" size="sm" disabled={loading} onClick={search}>
          Find
        </Button>
      </div>
      {results.length > 0 && (
        <ul className="rounded-md border divide-y">
          {results.map((r) => (
            <li key={`${r.lat}-${r.lon}`}>
              <button
                type="button"
                className="w-full text-left p-2 text-xs hover:bg-muted"
                onClick={() => {
                  onPick(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
                  setResults([]);
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
