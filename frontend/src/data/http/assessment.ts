// assessmentApi over HTTP (docs/03_api_contract.md §4.6). Same signatures as
// data/api/assessment.ts, plus `finalisePreview` (the page no longer reads the store). Mutations
// bump `useAssessmentRevision`, which the assessment pages include in their query keys.

import { create } from 'zustand';
import type {
  AssessmentView,
  CellPatch,
  FinalisePreview,
  QueueView,
} from '@/test/fake/api/assessment';
import type { NewFile } from '@/test/fake/api/thread';
import { apiFetch } from './client';

interface Revision {
  revision: number;
  bump: () => void;
}

export const useAssessmentRevision = create<Revision>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

const bump = <T>(p: Promise<T>) =>
  p.then((v) => {
    useAssessmentRevision.getState().bump();
    return v;
  });

const assessorPath = (lini1PositionId: string, quarterId: string, assessorPositionId: string) =>
  `/positions/${lini1PositionId}/quarters/${quarterId}/assessments/${assessorPositionId}`;

export const assessmentApi = {
  /** With `blind` the server grants the Superadmin view (permission 24) and audit-logs it. */
  page: (positionId: string, fiscalYear: number, tw: number, blind = false) =>
    apiFetch<AssessmentView>(
      `/positions/${positionId}/assessments/${fiscalYear}/${tw}${blind ? '?blind=1' : ''}`,
    ),

  queue: (quarterId: string | null) =>
    apiFetch<QueueView>(`/assessment-queue${quarterId ? `?quarterId=${quarterId}` : ''}`),

  finalisePreview: (
    positionId: string,
    fiscalYear: number,
    tw: number,
    assessorPositionId: string,
  ) =>
    apiFetch<FinalisePreview>(
      `/positions/${positionId}/assessments/${fiscalYear}/${tw}/finalise-preview?assessorPositionId=${assessorPositionId}`,
    ),

  saveCell: (rqId: string, assessorPositionId: string, patch: CellPatch) =>
    bump(
      apiFetch<void>(`/risk-quarters/${rqId}/assessments/${assessorPositionId}`, {
        method: 'PATCH',
        body: patch,
      }),
    ),

  /** Multipart: one `files` part per file, `data` = {confidential: [...]} (spec §4.7). */
  addFiles: (rqId: string, assessorPositionId: string, files: NewFile[]) => {
    const form = new FormData();
    form.append('data', JSON.stringify({ confidential: files.map((f) => f.confidential) }));
    for (const f of files) form.append('files', f.file ?? new Blob([], { type: f.mime }), f.name);
    return bump(
      apiFetch<void>(`/risk-quarters/${rqId}/assessments/${assessorPositionId}/files`, {
        method: 'POST',
        form,
      }),
    );
  },

  removeFile: (attachmentId: string) =>
    bump(apiFetch<void>(`/assessment-files/${attachmentId}`, { method: 'DELETE' })),

  markReady: (lini1PositionId: string, quarterId: string, assessorPositionId: string) =>
    bump(
      apiFetch<{ count: number }>(
        `${assessorPath(lini1PositionId, quarterId, assessorPositionId)}/ready`,
        { method: 'POST' },
      ).then((r) => r.count),
    ),

  finalise: (lini1PositionId: string, quarterId: string, assessorPositionId: string) =>
    bump(
      apiFetch<FinalisePreview>(
        `${assessorPath(lini1PositionId, quarterId, assessorPositionId)}/finalise`,
        { method: 'POST' },
      ),
    ),

  reopen: (assessmentId: string) =>
    bump(apiFetch<void>(`/assessments/${assessmentId}/reopen`, { method: 'POST' })),

  saveExplanation: (resultId: string, patch: { reason?: string; plan?: string }) =>
    bump(apiFetch<void>(`/results/${resultId}/explanation`, { method: 'PATCH', body: patch })),

  markExplanationsReady: (lini1PositionId: string, resultIds: string[]) =>
    bump(
      apiFetch<void>(`/positions/${lini1PositionId}/explanations/ready`, {
        method: 'POST',
        body: { resultIds },
      }),
    ),

  sendExplanations: (lini1PositionId: string, resultIds: string[]) =>
    bump(
      apiFetch<{ count: number }>(`/positions/${lini1PositionId}/explanations/send`, {
        method: 'POST',
        body: { resultIds },
      }).then((r) => r.count),
    ),

  /** The server logs the blind view when it serves `page(…, true)` (FR-NIL-012). */
  logBlindView: (positionId: string, quarterId: string) =>
    Promise.resolve(void [positionId, quarterId]),
};
