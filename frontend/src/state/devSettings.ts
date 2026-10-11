// Prototype-only switches controlled from the DevPanel.

import { create } from 'zustand';

interface DevSettings {
  /** Simulated network latency 150–400 ms so skeletons and "Menyimpan…" are visible. */
  latency: boolean;
  /** The next repository call fails (to demonstrate error states with "Coba Lagi"). */
  failNext: boolean;
  /** Browser offline simulation (banner + disabled sending). */
  offline: boolean;
  /** Idle minutes before the session ends (PRD: 60). */
  idleMinutes: number;
  set: (patch: Partial<Omit<DevSettings, 'set'>>) => void;
}

const KEY = 'simario:dev';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Partial<DevSettings>;
  } catch {
    // ignore
  }
  return {};
}

export const useDevSettings = create<DevSettings>((set, get) => ({
  latency: true,
  failNext: false,
  offline: false,
  idleMinutes: 60,
  ...load(),
  set: (patch) => {
    set(patch);
    const { latency, failNext, offline, idleMinutes } = { ...get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify({ latency, failNext, offline, idleMinutes }));
    } catch {
      // ignore
    }
  },
}));
