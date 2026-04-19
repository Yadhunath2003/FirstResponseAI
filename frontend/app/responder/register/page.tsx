"use client";

import Link from "next/link";
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
import { ChevronLeft } from "lucide-react";
import type { UnitType } from "@/lib/types";


const UNIT_TYPES: { value: UnitType; label: string }[] = [
  { value: "medics", label: "Medics" },
  { value: "fireman", label: "Fireman" },
  { value: "police", label: "Police" },
  { value: "rescue", label: "Rescue" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { deviceId, setUnit } = useSession();
  const [unitType, setUnitType] = useState<UnitType>("medics");
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

  const needsNumber = true; // All unit types now need a number

  return (
    <div className="flex flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2">
        <Link href="/responder">
          <Button variant="ghost" size="icon" aria-label="Back">
            <ChevronLeft className="size-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Register Unit</h1>
          <p className="text-xs text-muted-foreground">Pick your unit type and number.</p>
        </div>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Unit type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {UNIT_TYPES.map((t) => (
              <Button
                key={t.value}
                type="button"
                variant={unitType === t.value ? "default" : "outline"}
                className="h-12 text-sm"
                onClick={() => setUnitType(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>

          {needsNumber && (
            <div className="space-y-2">
              <Label htmlFor="num" className="text-sm">Unit number</Label>
              <Input
                id="num"
                inputMode="numeric"
                placeholder="e.g. 7, A, 12"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                autoComplete="off"
                className="h-12 text-base"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Button
        className="w-full h-12 text-base"
        disabled={register.isPending || (needsNumber && !unitNumber.trim())}
        onClick={() => register.mutate()}
      >
        {register.isPending ? "Registering…" : "Register"}
      </Button>
    </div>
  );
}
