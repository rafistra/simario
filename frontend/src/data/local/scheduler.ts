// Scheduled-task evaluator (CLAUDE.md §5). Stands in for Celery Beat: runs on app start, whenever
// the simulated clock moves, and after finalising events. Tasks must be idempotent.
// Later stages register comparison opening, lateness, recurrence detection, sheet freezing, and
// archiving here.

import type { ISODateTime } from '@/domain/types';
import { now } from '@/state/clock';
import type { DB } from '../db';
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

registerTask('attachment-scan', finishAttachmentScans);
registerTask('score-bands', activateScoreBands);
