// Displayed clock (CLAUDE.md §5): the server's time (`/me` serverNow — simulated in development),
// advancing with real time from the moment it was received, so "x menit lalu" behaves naturally.
// Kept in memory only; the server's clock is the source of truth.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { ISODate, ISODateTime } from '@/domain/types';

export const DEFAULT_NOW: ISODateTime = '2027-04-06T09:00';

interface ClockState {
  /** Simulated time at `baseReal`. */
  baseSim: ISODateTime;
  /** Real epoch ms when `baseSim` was set. */
  baseReal: number;
  setNow: (iso: ISODateTime) => void;
}

export const useClock = create<ClockState>((set) => ({
  baseSim: DEFAULT_NOW,
  baseReal: Date.now(),
  setNow: (iso) => set({ baseSim: iso.slice(0, 16), baseReal: Date.now() }),
}));

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a Date's UTC fields as a local 'YYYY-MM-DDTHH:mm' (the simulated clock lives in UTC fields). */
function toISO(d: Date): ISODateTime {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function now(): ISODateTime {
  const { baseSim, baseReal } = useClock.getState();
  const sim = new Date(`${baseSim}:00Z`).getTime() + (Date.now() - baseReal);
  return toISO(new Date(sim));
}

export const today = (): ISODate => now().slice(0, 10);

/** Re-renders every `intervalMs` and whenever the clock is moved. */
export function useNow(intervalMs = 30_000): ISODateTime {
  const base = useClock((s) => s.baseSim + s.baseReal);
  const [value, setValue] = useState(now);
  useEffect(() => {
    setValue(now());
    const id = window.setInterval(() => setValue(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [base, intervalMs]);
  return value;
}

/** Minutes between two simulated datetimes. */
export function minutesBetween(from: ISODateTime, to: ISODateTime): number {
  return Math.round((new Date(`${to}:00Z`).getTime() - new Date(`${from}:00Z`).getTime()) / 60_000);
}
