// sheetApi over HTTP (docs/03_api_contract.md §4.7). Same signatures as data/api/sheets.ts.
// Mutations bump `useSheetRevision`, which the sheet page includes in its query key.

import { create } from 'zustand';
import type { SheetSection } from '@/domain/rules/sheetPayload';
import type { PrintSnapshot } from '@/domain/types';
import type { SheetView } from '../api/sheets';
import { apiFetch } from './client';

interface Revision {
  revision: number;
  bump: () => void;
}

export const useSheetRevision = create<Revision>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

const bump = <T>(p: Promise<T>) =>
  p.then((v) => {
    useSheetRevision.getState().bump();
    return v;
  });

export const sheetApi = {
  /** The running sheet, or the frozen copy `snapshotId` (masked per viewer by the server). */
  view: (positionId: string, fiscalYear: number, tw: number, snapshotId: string | null) =>
    apiFetch<SheetView>(
      `/positions/${positionId}/sheets/${fiscalYear}/${tw}${snapshotId ? `?snapshot=${snapshotId}` : ''}`,
    ),

  setPhotos: (
    positionId: string,
    quarterId: string,
    section: SheetSection,
    attachmentIds: string[],
  ) =>
    bump(
      apiFetch<void>(`/positions/${positionId}/sheet-photos/${section}`, {
        method: 'PUT',
        body: { quarterId, attachmentIds },
      }),
    ),

  /** Creates the print snapshots; returns their ids (view each with `view(…, id)`). */
  print: (positionId: string, fiscalYear: number, tw: number, kinds: PrintSnapshot['kind'][]) =>
    bump(
      apiFetch<{ ids: string[] }>(`/positions/${positionId}/sheets/${fiscalYear}/${tw}/print`, {
        method: 'POST',
        body: { kinds },
      }).then((r) => r.ids),
    ),

  findByNumber: (number: string) =>
    apiFetch<{
      id: string;
      positionId: string;
      fiscalYear: number;
      tw: number;
      kind: PrintSnapshot['kind'];
    }>(`/snapshots?number=${encodeURIComponent(number.trim())}`),
};
