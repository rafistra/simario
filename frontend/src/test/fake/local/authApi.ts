// Local (localStorage) implementations of authApi and notificationApi, kept for the test fake
// backend (src/test/fakeBackend.ts) until B9. Pages use the HTTP versions via repository.ts.

import { minutesBetween, now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { SsoOutcome } from '@/data/http/auth';
import { ApiError, call } from './call';
import { getDb, mutateDb } from './store';
import { writeAudit } from './writers';

const LOCK_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export const localAuthApi = {
  /**
   * SSO sign-in stand-in: the persona picker passes the user matched by NIP (FR-AUT-001).
   * `nip` that matches nobody yields the verbatim "belum terdaftar" message and an audit entry.
   */
  signInSso: (nip: string) =>
    call<SsoOutcome>(() => {
      const user = getDb().users.find((u) => u.nip === nip);
      if (!user) {
        mutateDb((d) =>
          writeAudit(d, {
            at: now(),
            actorUserId: null,
            actingAs: null,
            actingPositionId: null,
            action: 'masuk_ditolak_belum_terdaftar',
            entityType: 'User',
            entityId: nip,
            before: null,
            after: null,
          }),
        );
        return {
          ok: false,
          message:
            'Akun Anda belum terdaftar di SIMARIO. Hubungi Superadmin, atau minta pejabat yang Anda bantu menunjuk Anda sebagai operator.',
        };
      }
      if (!user.active) return { ok: false, message: 'Akun Anda tidak aktif. Hubungi Superadmin.' };
      useSession.getState().signIn(user.id);
      return { ok: true, userId: user.id };
    }),

  /** Local account fallback with 5-attempt / 15-minute lockout (FR-AUT-002). */
  signInLocal: (nip: string, password: string) =>
    call<SsoOutcome>(() => {
      const session = useSession.getState();
      const lock = session.lockouts[nip];
      const at = now();
      if (lock?.until && at < lock.until) {
        const left = Math.max(1, minutesBetween(at, lock.until));
        return {
          ok: false,
          message: `Akun dikunci sementara setelah 5 kali gagal masuk. Coba lagi dalam ${left} menit.`,
        };
      }
      const user = getDb().users.find((u) => u.nip === nip.trim() && u.isLocalAccount);
      if (!user || user.password !== password) {
        const fails = (lock?.until ? 0 : (lock?.fails ?? 0)) + 1;
        if (fails >= LOCK_ATTEMPTS) {
          const until = new Date(`${at}:00Z`);
          until.setUTCMinutes(until.getUTCMinutes() + LOCK_MINUTES);
          session.setLockout(nip, { fails, until: until.toISOString().slice(0, 16) });
          return {
            ok: false,
            message: `Akun dikunci sementara setelah 5 kali gagal masuk. Coba lagi dalam ${LOCK_MINUTES} menit.`,
          };
        }
        session.setLockout(nip, { fails, until: null });
        return { ok: false, message: 'NIP atau kata sandi tidak sesuai' };
      }
      if (!user.active) return { ok: false, message: 'Akun Anda tidak aktif. Hubungi Superadmin.' };
      session.setLockout(nip, null);
      session.signIn(user.id);
      return { ok: true, userId: user.id };
    }),

  /** FR-AUT-003 (forced, no old password) and FR-AUT-004 (self-service). */
  changePassword: (userId: string, input: { oldPassword?: string; newPassword: string }) =>
    call(() => {
      const user = getDb().users.find((u) => u.id === userId);
      if (!user?.isLocalAccount)
        throw new ApiError('not_local', 'Hanya akun lokal yang memakai kata sandi SIMARIO.');
      if (!user.mustChangePassword && user.password !== input.oldPassword)
        throw new ApiError('old_password', 'Kata sandi lama tidak sesuai');
      if (input.newPassword.length < 12) throw new ApiError('too_short', 'Minimal 12 karakter.');
      if (input.newPassword === user.password)
        throw new ApiError('same', 'Kata sandi baru harus berbeda dari kata sandi awal.');
      mutateDb((d) => {
        const u = d.users.find((x) => x.id === userId)!;
        u.password = input.newPassword;
        u.mustChangePassword = false;
        // Passwords are never recorded in the audit trail (FR-ADM-008).
        writeAudit(d, {
          at: now(),
          actorUserId: userId,
          actingAs: null,
          actingPositionId: null,
          action: 'ganti_kata_sandi',
          entityType: 'User',
          entityId: userId,
          before: null,
          after: null,
        });
      });
    }),

  signOut: () => useSession.getState().signOut(),
};

export const localNotificationApi = {
  list: (userId: string) =>
    call(() =>
      getDb()
        .notifications.filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),
  markRead: (id: string) =>
    call(() =>
      mutateDb((d) => {
        const n = d.notifications.find((x) => x.id === id);
        if (n && !n.readAt) n.readAt = now();
      }),
    ),
  markAllRead: (userId: string) =>
    call(() =>
      mutateDb((d) => {
        for (const n of d.notifications) if (n.userId === userId && !n.readAt) n.readAt = now();
      }),
    ),
};
