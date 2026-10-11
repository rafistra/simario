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

registerTask('attachment-scan', finishAttachmentScans);
