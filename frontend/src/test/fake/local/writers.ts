// Central writers used inside `mutateDb` recipes: every data change records an append-only audit
// entry (NFR-007, INV-6), and notifications are idempotent per event key (FR-NTF common rules).

import type { AuditLog, Notification } from '@/domain/types';
import type { DB } from '../db';

let counter = 0;
const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const newId = uid;

export function writeAudit(draft: DB, entry: Omit<AuditLog, 'id'>) {
  // Append only: there is deliberately no update or delete helper for the audit trail.
  draft.audit.push({ id: uid('aud'), ...entry });
}

export function writeNotification(draft: DB, entry: Omit<Notification, 'id' | 'readAt'>): boolean {
  if (draft.notifications.some((n) => n.eventKey === entry.eventKey && n.userId === entry.userId))
    return false;
  draft.notifications.push({ id: uid('ntf'), readAt: null, ...entry });
  return true;
}
