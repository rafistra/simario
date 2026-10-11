// Prototype only: the sample data as it would have stood at an earlier moment, so scenarios such as
// "18 Mar 2027 — Rafi mengisi, Andi menuntaskan" start from a consistent state (CLAUDE.md §5,
// skenario Tahap 6). Everything timestamped after the cutoff is removed or rolled back.

import type { DB } from '../db';

export function seedAsOf(db: DB, cutoff: string): DB {
  const after = (t: string | null | undefined) => !!t && t > cutoff;
  const day = cutoff.slice(0, 10);

  const comments = db.comments
    .filter((c) => !after(c.createdAt))
    .map((c) => ({
      ...c,
      editedAt: after(c.editedAt) ? null : c.editedAt,
      withdrawnAt: after(c.withdrawnAt) ? null : c.withdrawnAt,
      withdrawnByUserId: after(c.withdrawnAt) ? null : c.withdrawnByUserId,
    }));
  const commentIds = new Set(comments.map((c) => c.id));

  // An assessment finalised after the cutoff had not been started yet (the seed keeps no draft history).
  const assessments = db.assessments.filter((a) => !after(a.finalisedAt) && !after(a.updatedAt));
  const assessmentIds = new Set(assessments.map((a) => a.id));

  const results = db.results
    .filter((r) => !after(r.openedAt))
    .map((r) =>
      after(r.explanationSentAt)
        ? {
            ...r,
            explanationStatus: r.explanationRequired ? ('pending' as const) : ('optional' as const),
            explanationReason: null,
            explanationPlan: null,
            explanationSentAt: null,
            explanationSentByUserId: null,
            explanationLateness: null,
          }
        : r,
    );

  const quarters = db.quarters.map((q) => {
    const first = q.lini3OpensOn < q.lini1OpensOn ? q.lini3OpensOn : q.lini1OpensOn;
    return first > day ? { ...q, scoreBandVersionId: null } : q;
  });
  const startedQuarter = new Set(quarters.filter((q) => q.startsOn <= day).map((q) => q.id));

  const riskQuarters = db.riskQuarters
    .filter((rq) => startedQuarter.has(rq.quarterId))
    .map((rq) => {
      const opened = results.filter((r) => r.riskQuarterId === rq.id);
      const expected = db.quarterAssessors.filter(
        (a) => a.quarterId === rq.quarterId && !a.excluded,
      ).length;
      return {
        ...rq,
        comparisonStatus:
          opened.length === 0
            ? ('waiting' as const)
            : opened.length >= expected
              ? ('open' as const)
              : ('partial' as const),
        firstOpenedAt: opened.length ? opened.map((r) => r.openedAt).sort()[0]! : null,
        recurring: opened.length ? rq.recurring : false,
      };
    });

  return {
    ...db,
    quarters,
    comments,
    attachments: db.attachments.filter(
      (a) =>
        !after(a.uploadedAt) &&
        (a.ownerKind === 'comment' ? commentIds.has(a.ownerId) : assessmentIds.has(a.ownerId)),
    ),
    assessments,
    results,
    riskQuarters,
    risks: db.risks.map((r) =>
      after(r.deactivatedAt)
        ? {
            ...r,
            status: 'active' as const,
            deactivatedAt: null,
            deactivatedFromQuarterId: null,
            deactivationReason: null,
          }
        : r,
    ),
    notifications: db.notifications.filter((n) => !after(n.createdAt)),
    audit: db.audit.filter((a) => !after(a.at)),
    threadViews: db.threadViews.filter((v) => !after(v.lastSeenAt)),
    proposals: db.proposals.filter((p) => !after(p.createdAt)),
    snapshots: db.snapshots.filter((x) => !after(x.createdAt)),
    fiscalYears: db.fiscalYears.map((f) =>
      after(f.archivedAt)
        ? { ...f, status: 'open' as const, archivedAt: null, archivedBy: null }
        : f,
    ),
  };
}
