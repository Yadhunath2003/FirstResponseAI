"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  unitId: string | null;
  callsign: string | null;
  unitType: string | null;
  unitNumber: string | null;
  deviceId: string;
  activeIncidentId: string | null;
  setUnit: (u: { unitId: string; callsign: string; unitType: string; unitNumber: string }) => void;
  setActiveIncident: (id: string | null) => void;
  clearUnit: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      unitId: null,
      callsign: null,
      unitType: null,
      unitNumber: null,
      deviceId: uuid(),
      activeIncidentId: null,
      setUnit: ({ unitId, callsign, unitType, unitNumber }) =>
        set({ unitId, callsign, unitType, unitNumber }),
      setActiveIncident: (id) => set({ activeIncidentId: id }),
      clearUnit: () =>
        set({ unitId: null, callsign: null, unitType: null, unitNumber: null, activeIncidentId: null }),
    }),
    { name: "fr-session" },
  ),
);
