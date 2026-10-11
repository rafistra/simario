// Scheduled-task evaluator (CLAUDE.md §5). Stands in for Celery Beat: runs on app start, whenever
// the simulated clock moves, and after finalising events. Tasks must be idempotent.
// Later stages register comparison opening, lateness, recurrence detection, sheet freezing, and
// archiving here.

import { assessedInQuarter } from '@/domain/rules/register';
import type { ISODateTime } from '@/domain/types';
import { now } from '@/state/clock';
import type { DB } from '../db';
import { runComparisons } from './comparisons';
import { runReminders } from './reminders';
import { mutateDb } from './store';

export type ScheduledTask = (draft: DB, at: ISODateTime) => void;

const tasks = new Map<string, ScheduledTask>();

export function registerTask(name: string, task: ScheduledTask) {
  tasks.set(name, task);
}

export function runScheduledTasks(at: ISODateTime = now()) {
  mutateDb((draft) => {
    for (const task of tasks.values()) task(draft, at);
  });
}

/** NFR-010: a file shows "Memindai…" until the scan finishes (simulated: one minute). */
export const finishAttachmentScans: ScheduledTask = (draft, at) => {
  for (const a of draft.attachments) {
    if (a.scanStatus === 'pending' && a.uploadedAt < at) a.scanStatus = 'clean';
  }
};

/**
 * FR-MST-007: a saved (scheduled) band version becomes the single active version on its effective
 * date; each quarter fixes its band version when its first window opens, so a quarter already
 * open keeps its version.
 */
export const activateScoreBands: ScheduledTask = (draft, at) => {
  const day = at.slice(0, 10);
  const due = draft.scoreBandVersions
    .filter((v) => v.status === 'scheduled' && v.effectiveFrom <= day)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const v of due) {
    for (const other of draft.scoreBandVersions)
      if (other.status === 'active') other.status = 'retired';
    v.status = 'active';
  }
  const active = draft.scoreBandVersions.find((v) => v.status === 'active');
  if (!active) return;
  for (const q of draft.quarters) {
    const firstWindow = q.lini3OpensOn < q.lini1OpensOn ? q.lini3OpensOn : q.lini1OpensOn;
    if (q.scoreBandVersionId === null && firstWindow <= day) q.scoreBandVersionId = active.id;
  }
};

/**
 * RB-REG-006: when a quarter starts, every risk assessed in it gets its RiskQuarter row (risks
 * published mid-quarter get theirs at publish). Archived years are left as they are.
 */
export const ensureRiskQuarters: ScheduledTask = (draft, at) => {
  const day = at.slice(0, 10);
  const open = new Set(draft.fiscalYears.filter((f) => f.status !== 'archived').map((f) => f.year));
  const existing = new Set(draft.riskQuarters.map((rq) => `${rq.registerRiskId}|${rq.quarterId}`));
  for (const q of draft.quarters) {
    if (!open.has(q.fiscalYear) || q.startsOn > day) continue;
    for (const risk of draft.risks) {
      if (existing.has(`${risk.id}|${q.id}`) || !assessedInQuarter(draft, risk, q)) continue;
      draft.riskQuarters.push({
        id: `rq-${risk.id}-${q.id}`,
        registerRiskId: risk.id,
        quarterId: q.id,
        comparisonStatus: 'waiting',
        firstOpenedAt: null,
        recurring: false,
      });
      existing.add(`${risk.id}|${q.id}`);
    }
  }
};

registerTask('attachment-scan', finishAttachmentScans);
registerTask('risk-quarters', ensureRiskQuarters);
registerTask('score-bands', activateScoreBands);
/** §2.5: comparisons open per risk at the Lini 3 deadline or when every assessor has finalised. */
registerTask('comparisons', (draft, at) => runComparisons(draft, at));
/** FR-NTF-005/006/009/012 reminders. */
registerTask('reminders', runReminders);
