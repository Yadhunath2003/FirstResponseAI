"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Incident, IncidentType } from "@/lib/types";
import { toast } from "sonner";

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: "structure_fire", label: "Structure Fire" },
  { value: "mci", label: "MCI" },
  { value: "hazmat", label: "Hazmat" },
  { value: "rescue", label: "Rescue" },
  { value: "other", label: "Other" },
];

interface Props {
  trigger: ReactElement;
  // If set, auto-join as this unit right after create, then navigate.
  autoJoinAs?: string | null;
  // Base path for the incident detail page ("/dashboard" or "/responder/incidents")
  detailPathBase: string;
  onCreated?: (incident: Incident) => void;
}

export function CreateIncidentDialog({
  trigger,
  autoJoinAs,
  detailPathBase,
  onCreated,
}: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<IncidentType>("structure_fire");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<NominatimHit[]>([]);
  const [chosen, setChosen] = useState<NominatimHit | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const reset = () => {
    setName("");
    setType("structure_fire");
    setAddress("");
    setResults([]);
    setChosen(null);
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!chosen) throw new Error("Pick a location first.");
      const incident = await api.createIncident({
        name: name.trim() || `${prettyType(type)} — ${chosen.display_name.split(",")[0]}`,
        incident_type: type,
        location_name: chosen.display_name,
        location_lat: parseFloat(chosen.lat),
        location_lng: parseFloat(chosen.lon),
      });
      if (autoJoinAs) {
        await api.joinIncident(incident.id, autoJoinAs);
      }
      return incident;
    },
    onSuccess: (incident) => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      toast.success(`Incident created: ${incident.name}`);
      onCreated?.(incident);
      setOpen(false);
      reset();
      router.push(`${detailPathBase}/${incident.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const searchAddress = async () => {
    if (address.trim().length < 3) return;
    setGeoLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        address,
      )}&format=json&limit=5`;
      const res = await fetch(url);
      const items = (await res.json()) as NominatimHit[];
      setResults(items);
      if (items.length === 0) toast.warning("No matches for that address.");
    } catch {
      toast.error("Geocoding lookup failed.");
    } finally {
      setGeoLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New incident</DialogTitle>
          <DialogDescription>
            Create an incident manually. For voice dispatch, use{" "}
            <code className="text-xs">/dashboard/dispatch</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inc-name">Name (optional)</Label>
            <Input
              id="inc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2-Alarm at Oak & 9th"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {INCIDENT_TYPES.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={type === t.value ? "default" : "outline"}
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inc-addr">Address</Label>
            <div className="flex gap-1">
              <Input
                id="inc-addr"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  if (chosen) setChosen(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchAddress();
                  }
                }}
                placeholder="123 Main St, City"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={geoLoading || address.trim().length < 3}
                onClick={searchAddress}
              >
                {geoLoading ? "…" : "Find"}
              </Button>
            </div>
            {results.length > 0 && !chosen && (
              <ul className="rounded-md border divide-y max-h-40 overflow-auto">
                {results.map((r) => (
                  <li key={`${r.lat}-${r.lon}`}>
                    <button
                      type="button"
                      className="w-full text-left p-2 text-xs hover:bg-muted"
                      onClick={() => {
                        setChosen(r);
                        setResults([]);
                      }}
                    >
                      {r.display_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {chosen && (
              <div className="rounded-md border p-2 text-xs flex items-start justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-1 text-[10px]">
                    Selected
                  </Badge>
                  <p className="text-muted-foreground">{chosen.display_name}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setChosen(null)}
                >
                  Change
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!chosen || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating…" : autoJoinAs ? "Create & join" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function prettyType(t: IncidentType): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}
