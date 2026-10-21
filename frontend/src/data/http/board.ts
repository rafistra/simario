// boardApi and threadApi over HTTP (docs/03_api_contract.md §4.5). Same signatures as
// data/api/board.ts and data/api/thread.ts. Mutations bump `useBoardRevision`, which the board
// and thread pages include in their query keys, so they reload the server view.

import { create } from 'zustand';
import { quarterLabel } from '@/domain/calendar';
import type { Participant } from '@/domain/rules/board';
import type { BoardView, ThreadView } from '../api/board';
import type { PostInput } from '../api/thread';
import { apiFetch } from './client';
import { toBackendIds } from './legacyIds';

interface Revision {
  revision: number;
  bump: () => void;
}

export const useBoardRevision = create<Revision>((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

const bump = <T>(p: Promise<T>) =>
  p.then((v) => {
    useBoardRevision.getState().bump();
    return v;
  });

/** Download link for an attachment (302 to a short-lived URL under /storage). */
export const attachmentUrl = (id: string) =>
  `/api/v1${toBackendIds(`/attachments/${id}/download`)}`;

export const boardApi = {
  board: (positionId: string, fiscalYear: number) =>
    apiFetch<BoardView>(`/positions/${positionId}/board/${fiscalYear}`),
  thread: (riskId: string) => apiFetch<ThreadView>(`/register-risks/${riskId}/thread`),
  quarterLabel,
};

export const threadApi = {
  /** Multipart: `data` (JSON) plus one `files` part per file (spec §4.7). */
  post: async (input: PostInput) => {
    const form = new FormData();
    form.append(
      'data',
      JSON.stringify(
        toBackendIds({
          mitigationId: input.mitigationId,
          body: input.body,
          quarterId: input.quarterId ?? null,
          isStep: input.isStep,
          mentionUserIds: input.mentionUserIds,
          confidential: input.files.map((f) => f.confidential),
        }),
      ),
    );
    for (const f of input.files)
      form.append('files', f.file ?? new Blob([], { type: f.mime }), f.name);
    const res = await apiFetch<{ id: string }>(`/register-risks/${input.riskId}/comments`, {
      method: 'POST',
      form,
    });
    useBoardRevision.getState().bump();
    return res.id;
  },

  edit: (commentId: string, body: string) =>
    bump(apiFetch<void>(`/comments/${commentId}`, { method: 'PATCH', body: { body } })),

  withdraw: (commentId: string) =>
    bump(apiFetch<void>(`/comments/${commentId}/withdraw`, { method: 'POST' })),

  setConfidential: (attachmentId: string, on: boolean) =>
    bump(
      apiFetch<void>(`/attachments/${attachmentId}`, {
        method: 'PATCH',
        body: { isConfidential: on },
      }),
    ),

  follow: (riskId: string, on: boolean) =>
    bump(
      apiFetch<void>(`/register-risks/${riskId}/subscription`, { method: on ? 'PUT' : 'DELETE' }),
    ),

  /** Records the visit (unseen dots); fire-and-forget like the local version. */
  markSeen: (riskId: string) => {
    void apiFetch<void>(`/register-risks/${riskId}/seen`, { method: 'POST' }).catch(
      () => undefined,
    );
  },

  /** Mention picker: participants for the comment's quarter (FR-PPN-007). */
  participants: (riskId: string, quarterId: string) =>
    apiFetch<Participant[]>(`/register-risks/${riskId}/participants`, { query: { quarterId } }),

  /** 30-second poll (NFR-015): newer comments by others since `since`. */
  since: (riskId: string, since: string) =>
    apiFetch<{ comments: number; latestAt: string | null }>(`/register-risks/${riskId}/thread`, {
      query: { since },
    }),
};
