// Board threads — PRD §6 (FR-PPN-003 … 012). Posting needs participation (§1.5, permission 6) for
// the comment's quarter; Langkah is Lini 1 only and only in the posting quarter (RB-PPN-004);
// confidential files are Lini 3 (FR-PPN-006). Nothing is deleted (RB-PPN-003).

import {
  canEditComment,
  fileProblem,
  isAlwaysSubscribed,
  MAX_COMMENT_LENGTH,
  MAX_FILES,
  postingQuarter,
  QUOTA_BYTES,
  relatedQuarters,
  storageUsed,
  threadParticipants,
} from '@/domain/rules/board';
import { hasPermission, participationHolding, type Holding } from '@/domain/rules/access';
import type { Comment, RegisterRisk } from '@/domain/types';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit, writeNotification } from '../local/writers';

export interface NewFile {
  name: string;
  size: number;
  mime: string;
  confidential: boolean;
}

export interface PostInput {
  riskId: string;
  mitigationId: string | null;
  body: string;
  /** "Terkait TW [n]" choice; defaults to the posting quarter. */
  quarterId?: string;
  isStep: boolean;
  files: NewFile[];
  mentionUserIds: string[];
}

/** Simulated scan time before an upload becomes "clean" (NFR-010). */
export const SCAN_MS = 2000;

function sessionUser() {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  return userId;
}

function context(db: DB, riskId: string) {
  const risk = db.risks.find((r) => r.id === riskId);
  if (!risk) throw new ApiError('not_found', 'Risiko tidak ditemukan.');
  const register = db.registers.find((r) => r.id === risk.registerId)!;
  const fy = db.fiscalYears.find((f) => f.year === register.fiscalYear);
  if (fy?.status === 'archived')
    throw new ApiError(
      'archived',
      `Utas ini diarsipkan pada ${fy.archivedAt?.slice(0, 10) ?? ''}. Utas hanya dapat dibaca.`,
    );
  return { risk, register };
}

const threadUrl = (risk: RegisterRisk, positionId: string, fiscalYear: number) =>
  `/jabatan/${positionId}/papan/${fiscalYear}/risiko/${risk.id}`;

function auditAs(
  d: DB,
  userId: string,
  at: string,
  h: Holding | null,
  action: string,
  type: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  writeAudit(d, {
    at,
    actorUserId: userId,
    actingAs: h?.capacity ?? null,
    actingPositionId: h?.positionId ?? null,
    action,
    entityType: type,
    entityId: id,
    before,
    after,
  });
}

function subscribe(d: DB, userId: string, riskId: string) {
  const s = d.subscriptions.find((x) => x.userId === userId && x.registerRiskId === riskId);
  if (s) s.muted = false;
  else d.subscriptions.push({ userId, registerRiskId: riskId, muted: false });
}

const shortDesc = (r: RegisterRisk) =>
  r.descriptionSnapshot.length > 80
    ? `${r.descriptionSnapshot.slice(0, 79)}…`
    : r.descriptionSnapshot;

export const threadApi = {
  post: (input: PostInput) =>
    call<string>(() => {
      const userId = sessionUser();
      const at = now();
      const today = at.slice(0, 10);
      const db = getDb();
      const { risk, register } = context(db, input.riskId);
      const posting = postingQuarter(db, register.fiscalYear, today);
      if (!posting)
        throw new ApiError('not_started', `Tahun anggaran ${register.fiscalYear} belum dimulai.`);
      const quarterId = input.quarterId ?? posting.id;
      if (
        quarterId !== posting.id &&
        !relatedQuarters(db, risk, posting, at).some((q) => q.id === quarterId)
      )
        throw new ApiError('validation', 'Triwulan terkait tidak dapat dipilih untuk risiko ini.');
      const holding = participationHolding(db, userId, register.positionId, quarterId, today);
      if (!holding)
        throw new ApiError(
          'forbidden',
          'Anda dapat membaca utas ini, tetapi tidak dapat berkomentar.',
        );
      const body = input.body.replace(/\r\n/g, '\n').trim();
      if (!body && input.files.length === 0)
        throw new ApiError('validation', 'Tulis komentar atau lampirkan berkas.');
      if (body.length > MAX_COMMENT_LENGTH)
        throw new ApiError(
          'validation',
          `Komentar maksimal ${MAX_COMMENT_LENGTH.toLocaleString('id-ID')} karakter.`,
        );
      if (input.isStep && holding.line !== 1)
        throw new ApiError('validation', 'Hanya Lini 1 yang dapat menandai Langkah.');
      if (input.isStep && quarterId !== posting.id)
        throw new ApiError(
          'validation',
          'Langkah selalu tercatat pada triwulan berjalan; pilih triwulan berjalan untuk menandai Langkah.',
        );
      if (input.files.length > MAX_FILES)
        throw new ApiError('validation', `Maksimal ${MAX_FILES} berkas per komentar.`);
      for (const f of input.files) {
        const problem = fileProblem(f.name, f.size);
        if (problem) throw new ApiError('validation', `${f.name}: ${problem}`);
      }
      if (input.files.some((f) => f.confidential) && holding.line !== 3)
        throw new ApiError('validation', 'Hanya Lini 3 yang dapat menandai lampiran konfidensial.');
      const incoming = input.files.reduce((n, f) => n + f.size, 0);
      if (
        incoming > 0 &&
        storageUsed(db, register.positionId, register.fiscalYear) + incoming > QUOTA_BYTES
      )
        throw new ApiError(
          'quota',
          `Kuota penyimpanan ${'1 GB'} untuk jabatan ini pada TA ${register.fiscalYear} sudah penuh. Unggahan ditolak.`,
        );
      const participants = new Set(
        threadParticipants(db, register.positionId, quarterId, today).map((p) => p.userId),
      );
      const mentions = [...new Set(input.mentionUserIds)].filter(
        (id) => id !== userId && participants.has(id),
      );

      const id = newId('cm');
      const fileIds: string[] = [];
      mutateDb((d) => {
        const comment: Comment = {
          id,
          registerRiskId: risk.id,
          registerMitigationId: input.mitigationId,
          authorUserId: userId,
          authorLine: holding.line,
          actingAs: holding.capacity,
          actingPositionId: holding.positionId,
          quarterId,
          body,
          isStep: input.isStep,
          createdAt: at,
          editedAt: null,
          withdrawnAt: null,
          withdrawnByUserId: null,
          mentionUserIds: mentions,
        };
        d.comments.push(comment);
        for (const f of input.files) {
          const fid = newId('att');
          fileIds.push(fid);
          d.attachments.push({
            id: fid,
            ownerKind: 'comment',
            ownerId: id,
            filename: f.name,
            sizeBytes: f.size,
            mimeType: f.mime,
            scanStatus: 'pending',
            isConfidential: f.confidential,
            uploadedById: userId,
            uploadedAt: at,
          });
        }
        subscribe(d, userId, risk.id);
        const view = d.threadViews.find((v) => v.userId === userId && v.registerRiskId === risk.id);
        if (view) view.lastSeenAt = at;
        else d.threadViews.push({ userId, registerRiskId: risk.id, lastSeenAt: at });

        const author = d.users.find((u) => u.id === userId)!.fullName;
        const base = threadUrl(risk, register.positionId, register.fiscalYear);
        // FR-NTF-003: mention.
        for (const m of mentions) {
          subscribe(d, m, risk.id);
          writeNotification(d, {
            userId: m,
            kind: 'mention',
            text: `${author} menyebut Anda di utas '${shortDesc(risk)}'`,
            targetUrl: `${base}#komentar-${id}`,
            createdAt: at,
            eventKey: `mention:${id}:${m}`,
          });
        }
        // FR-NTF-004: subscribers (holders always) except the author, the muted and the mentioned; aggregated while unread.
        const recipients = new Set<string>();
        for (const u of d.users)
          if (u.active && isAlwaysSubscribed(d, u.id, register.positionId, today))
            recipients.add(u.id);
        for (const s of d.subscriptions)
          if (s.registerRiskId === risk.id && !s.muted) recipients.add(s.userId);
        recipients.delete(userId);
        for (const m of mentions) recipients.delete(m);
        for (const r of recipients) {
          const open = d.notifications.find(
            (n) => n.userId === r && n.kind === 'new_comments' && !n.readAt && n.targetUrl === base,
          );
          if (open) {
            const count = Number(/^(\d+)/.exec(open.text)?.[1] ?? '1') + 1;
            open.text = `${count} komentar baru di '${shortDesc(risk)}'`;
            open.createdAt = at;
          } else
            writeNotification(d, {
              userId: r,
              kind: 'new_comments',
              text: `1 komentar baru di '${shortDesc(risk)}'`,
              targetUrl: base,
              createdAt: at,
              eventKey: `thread:${risk.id}:${r}:${at}:${id}`,
            });
        }
        auditAs(d, userId, at, holding, 'kirim_komentar', 'Comment', id, null, {
          quarterId,
          isStep: input.isStep,
          mitigationId: input.mitigationId,
          files: input.files.length,
        });
      });
      // NFR-010: the simulated scan finishes shortly after upload.
      if (fileIds.length)
        setTimeout(() => {
          mutateDb((d) => {
            for (const a of d.attachments)
              if (fileIds.includes(a.id) && a.scanStatus === 'pending') a.scanStatus = 'clean';
          });
        }, SCAN_MS);
      return id;
    }),

  /** FR-PPN-008 / INV-19: author only, within 15 minutes. */
  edit: (commentId: string, body: string) =>
    call(() => {
      const userId = sessionUser();
      const at = now();
      const db = getDb();
      const c = db.comments.find((x) => x.id === commentId);
      if (!c) throw new ApiError('not_found', 'Komentar tidak ditemukan.');
      context(db, c.registerRiskId);
      if (c.authorUserId !== userId)
        throw new ApiError('forbidden', 'Hanya penulis yang dapat menyunting komentar.');
      if (!canEditComment(c, userId, at))
        throw new ApiError(
          'edit_window',
          'Komentar hanya dapat disunting dalam 15 menit setelah dikirim.',
        );
      const text = body.replace(/\r\n/g, '\n').trim();
      if (!text) throw new ApiError('validation', 'Komentar tidak boleh kosong.');
      if (text.length > MAX_COMMENT_LENGTH)
        throw new ApiError(
          'validation',
          `Komentar maksimal ${MAX_COMMENT_LENGTH.toLocaleString('id-ID')} karakter.`,
        );
      mutateDb((d) => {
        const x = d.comments.find((y) => y.id === commentId)!;
        if (x.body === text) return;
        auditAs(
          d,
          userId,
          at,
          { capacity: x.actingAs, positionId: x.actingPositionId } as Holding,
          'sunting_komentar',
          'Comment',
          x.id,
          { body: x.body },
          { body: text },
        );
        x.body = text;
        x.editedAt = at;
      });
    }),

  /** FR-PPN-008 / VIS-6: the author may withdraw at any time; the original stays in the audit trail. */
  withdraw: (commentId: string) =>
    call(() => {
      const userId = sessionUser();
      const at = now();
      const db = getDb();
      const c = db.comments.find((x) => x.id === commentId);
      if (!c) throw new ApiError('not_found', 'Komentar tidak ditemukan.');
      context(db, c.registerRiskId);
      if (c.authorUserId !== userId)
        throw new ApiError('forbidden', 'Hanya penulis yang dapat menarik komentar.');
      if (c.withdrawnAt) return;
      mutateDb((d) => {
        const x = d.comments.find((y) => y.id === commentId)!;
        x.withdrawnAt = at;
        x.withdrawnByUserId = userId;
        auditAs(
          d,
          userId,
          at,
          { capacity: x.actingAs, positionId: x.actingPositionId } as Holding,
          'tarik_komentar',
          'Comment',
          x.id,
          { body: x.body, isStep: x.isStep },
          { withdrawnAt: at },
        );
      });
    }),

  /** FR-PPN-006: switching on by the uploader; switching off needs permission 25 (audited). */
  setConfidential: (attachmentId: string, on: boolean) =>
    call(() => {
      const userId = sessionUser();
      const at = now();
      const db = getDb();
      const a = db.attachments.find((x) => x.id === attachmentId);
      if (!a) throw new ApiError('not_found', 'Lampiran tidak ditemukan.');
      const c = db.comments.find((x) => x.id === a.ownerId);
      if (c) context(db, c.registerRiskId);
      if (on && a.uploadedById !== userId)
        throw new ApiError(
          'forbidden',
          'Hanya pengunggah yang dapat menandai lampiran konfidensial.',
        );
      if (!on && !hasPermission(db, userId, 25, at.slice(0, 10)))
        throw new ApiError('forbidden', 'Mematikan status konfidensial memerlukan izin khusus.');
      mutateDb((d) => {
        const x = d.attachments.find((y) => y.id === attachmentId)!;
        if (x.isConfidential === on) return;
        auditAs(
          d,
          userId,
          at,
          null,
          on ? 'konfidensial_nyala' : 'konfidensial_mati',
          'Attachment',
          x.id,
          { isConfidential: x.isConfidential },
          { isConfidential: on },
        );
        x.isConfidential = on;
      });
    }),

  /** FR-PPN-010: "Ikuti" / "Berhenti mengikuti"; the position's holders cannot unfollow. */
  follow: (riskId: string, on: boolean) =>
    call(() => {
      const userId = sessionUser();
      const db = getDb();
      const { risk, register } = context(db, riskId);
      if (!on && isAlwaysSubscribed(db, userId, register.positionId, now().slice(0, 10)))
        throw new ApiError('forbidden', 'Pemegang jabatan selalu mengikuti utas jabatannya.');
      mutateDb((d) => {
        const s = d.subscriptions.find((x) => x.userId === userId && x.registerRiskId === risk.id);
        if (s) s.muted = !on;
        else d.subscriptions.push({ userId, registerRiskId: risk.id, muted: !on });
      });
    }),

  /** Records the visit for unseen-activity dots (FR-PPN-001). View state only; not audited. */
  markSeen: (riskId: string) => {
    const userId = useSession.getState().userId;
    if (!userId) return;
    const at = now();
    mutateDb((d) => {
      const v = d.threadViews.find((x) => x.userId === userId && x.registerRiskId === riskId);
      if (v) v.lastSeenAt = at;
      else d.threadViews.push({ userId, registerRiskId: riskId, lastSeenAt: at });
    });
  },
};
