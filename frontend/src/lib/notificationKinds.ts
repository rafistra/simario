// Notification kinds (FR-NTF-001 … 012): filter labels and dot tone.

/** Labels for notification kinds (FR-NTF-001 … 012) used by filters and the kind dot. */
export const NOTIFICATION_KINDS: Record<string, { label: string; tone: string }> = {
  ready: { label: 'Siap dituntaskan', tone: 'info' },
  register_published: { label: 'Register terbit', tone: 'info' },
  mention: { label: 'Sebutan', tone: 'primary' },
  new_comments: { label: 'Komentar baru', tone: 'primary' },
  deadline: { label: 'Tenggat', tone: 'warn' },
  comparison_opened: { label: 'Perbandingan dibuka', tone: 'success' },
  recurring: { label: 'Berulang', tone: 'danger' },
  explanation_required: { label: 'Penjelasan', tone: 'danger' },
  explanation_sent: { label: 'Penjelasan terkirim', tone: 'success' },
  operator_appointed: { label: 'Operator', tone: 'info' },
  operator_revoked: { label: 'Operator', tone: 'info' },
  proposal_accepted: { label: 'Usulan', tone: 'info' },
  proposal_rejected: { label: 'Usulan', tone: 'info' },
  archive: { label: 'Arsip', tone: 'warn' },
};

export const kindLabel = (kind: string) => NOTIFICATION_KINDS[kind]?.label ?? 'Lainnya';
