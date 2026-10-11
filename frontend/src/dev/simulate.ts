// Prototype-only helpers for demos (DevPanel). Not part of the repository layer.

import { getDb, mutateDb } from '@/data/local/store';
import { newId } from '@/data/local/writers';
import { postingQuarter, threadParticipants } from '@/domain/rules/board';
import { now } from '@/state/clock';

/**
 * FR-PPN-011 demo: another participant posts on the thread being viewed, so the
 * "[n] komentar baru — Tampilkan" banner appears. Returns the author's name, or null.
 */
export function simulateIncomingComment(riskId: string, viewerId: string): string | null {
  const db = getDb();
  const risk = db.risks.find((r) => r.id === riskId);
  const register = risk && db.registers.find((r) => r.id === risk.registerId);
  if (!risk || !register) return null;
  const at = now();
  const q = postingQuarter(db, register.fiscalYear, at.slice(0, 10));
  if (!q) return null;
  const author =
    threadParticipants(db, register.positionId, q.id, at.slice(0, 10), viewerId).find(
      (p) => p.holding.line !== 1,
    ) ?? threadParticipants(db, register.positionId, q.id, at.slice(0, 10), viewerId)[0];
  if (!author) return null;
  mutateDb((d) => {
    d.comments.push({
      id: newId('cm'),
      registerRiskId: risk.id,
      registerMitigationId: null,
      authorUserId: author.userId,
      authorLine: author.holding.line,
      actingAs: author.holding.capacity,
      actingPositionId: author.holding.positionId,
      quarterId: q.id,
      body: 'Mohon pembaruan progres minggu ini beserta dokumen pendukungnya.',
      isStep: false,
      createdAt: at,
      editedAt: null,
      withdrawnAt: null,
      withdrawnByUserId: null,
      mentionUserIds: [],
    });
  });
  return author.name;
}
