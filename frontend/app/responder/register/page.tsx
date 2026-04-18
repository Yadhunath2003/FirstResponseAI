"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { UnitType } from "@/lib/types";

const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "engine", label: "Engine" },
  { value: "ladder", label: "Ladder" },
  { value: "medic", label: "Medic" },
  { value: "battalion_chief", label: "Battalion Chief" },
  { value: "division", label: "Division" },
  { value: "command", label: "Command" },
  { value: "safety", label: "Safety" },
  { value: "staging", label: "Staging" },
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

  return (
    <div className="p-4 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Register Unit</h1>
        <p className="text-xs text-muted-foreground">Pick your unit type and number.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unit info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Unit type</Label>
            <div className="grid grid-cols-2 gap-2">
              {UNIT_TYPES.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  variant={unitType === t.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUnitType(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {needsNumber && (
            <div className="space-y-2">
              <Label htmlFor="num">Unit number</Label>
              <Input
                id="num"
                placeholder="e.g. 7, A, 12"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          <Button
            className="w-full"
            disabled={register.isPending || (needsNumber && !unitNumber.trim())}
            onClick={() => register.mutate()}
          >
            {register.isPending ? "Registering…" : "Register"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
