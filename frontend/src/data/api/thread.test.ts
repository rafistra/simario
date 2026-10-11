import { act } from '@testing-library/react';
import { hasLangkah, isQuiet, relatedQuarters } from '@/domain/rules/board';
import { useClock } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { getDb, useDb } from '../local/store';
import { buildBoard, buildThread } from './board';
import { threadApi, type PostInput } from './thread';

function as(userId: string) {
  act(() => useSession.getState().signIn(userId));
}

const AT = '2027-04-06T09:00';
const post = (over: Partial<PostInput> = {}) =>
  threadApi.post({
    riskId: 'rr-a1-pembayaran',
    mitigationId: null,
    body: 'Uji komentar.',
    isStep: false,
    files: [],
    mentionUserIds: [],
    ...over,
  });
const q = (id: string) => getDb().quarters.find((x) => x.id === id)!;
const risk = (id: string) => getDb().risks.find((r) => r.id === id)!;

beforeEach(() => {
  useDevSettings.getState().set({ latency: false, offline: false, failNext: false });
  useClock.getState().setNow(AT);
  useDb.getState().reset();
});

describe('participation (§1.5, RB-PPN-001)', () => {
  it('lets a reader in scope read but not post', async () => {
    as('usr-dewi');
    const view = buildThread(getDb(), 'usr-dewi', 'rr-a1-penyerapan', AT);
    expect(view.participation).toBeNull();
    await expect(post()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps Langkah for Lini 1 and confidential files for Lini 3', async () => {
    as('usr-siti');
    await expect(post({ isStep: true })).rejects.toMatchObject({
      message: 'Hanya Lini 1 yang dapat menandai Langkah.',
    });
    await expect(
      post({ files: [{ name: 'a.pdf', size: 10, mime: 'application/pdf', confidential: true }] }),
    ).rejects.toMatchObject({
      message: 'Hanya Lini 3 yang dapat menandai lampiran konfidensial.',
    });
  });

  it('refuses posting on an archived thread', async () => {
    as('usr-andi');
    const old = getDb().risks.find(
      (r) => r.registerId === 'reg-ppk-a1-2026' && r.status === 'active',
    )!;
    await expect(post({ riskId: old.id })).rejects.toMatchObject({ code: 'archived' });
  });
});

describe('Langkah and the quiet marker (FR-PPN-004, 009)', () => {
  it('a Langkah clears the marker and withdrawing it brings the marker back', async () => {
    as('usr-andi');
    const tw2 = q('q-2027-2');
    expect(isQuiet(getDb(), risk('rr-a1-pembayaran'), tw2)).toBe(true);
    const id = await post({ isStep: true });
    expect(hasLangkah(getDb(), 'rr-a1-pembayaran', tw2.id)).toBe(true);
    expect(isQuiet(getDb(), risk('rr-a1-pembayaran'), tw2)).toBe(false);
    await threadApi.withdraw(id);
    expect(isQuiet(getDb(), risk('rr-a1-pembayaran'), tw2)).toBe(true);
    const c = getDb().comments.find((x) => x.id === id)!;
    expect(
      buildThread(getDb(), 'usr-andi', 'rr-a1-pembayaran', AT)
        .timeline.flatMap((g) => g.comments)
        .find((x) => x.id === id)!.withdrawnText,
    ).toMatch(/^Komentar ditarik oleh Andi Wirawan pada 6 Apr 2027 09\.00$/);
    expect(
      getDb().audit.some(
        (a) => a.action === 'tarik_komentar' && (a.before as { body: string }).body === c.body,
      ),
    ).toBe(true);
  });

  it('a Langkah on a mitigation also clears the risk marker', async () => {
    as('usr-rafi');
    const mit = getDb().mitigations.find(
      (m) => m.registerRiskId === 'rr-a1-pembayaran' && m.status === 'active',
    )!;
    await post({ mitigationId: mit.id, isStep: true });
    expect(isQuiet(getDb(), risk('rr-a1-pembayaran'), q('q-2027-2'))).toBe(false);
  });
});

describe('"Terkait TW" (RB-PPN-004)', () => {
  it('offers an earlier quarter with a pending explanation and forbids a Langkah there', async () => {
    as('usr-andi');
    const related = relatedQuarters(getDb(), risk('rr-a1-penyerapan'), q('q-2027-2'), AT);
    expect(related.map((x) => x.id)).toEqual(['q-2027-1']);
    await expect(
      post({ riskId: 'rr-a1-penyerapan', quarterId: 'q-2027-1', isStep: true }),
    ).rejects.toMatchObject({ code: 'validation' });
    const id = await post({ riskId: 'rr-a1-penyerapan', quarterId: 'q-2027-1' });
    expect(getDb().comments.find((c) => c.id === id)!.quarterId).toBe('q-2027-1');
  });
});

describe('edit window and notifications (INV-19, FR-NTF-003/004)', () => {
  it('allows editing for 15 minutes only', async () => {
    as('usr-andi');
    const id = await post();
    await threadApi.edit(id, 'Uji komentar (diperbaiki).');
    expect(getDb().comments.find((c) => c.id === id)!.editedAt).not.toBeNull();
    useClock.getState().setNow('2027-04-06T09:16');
    await expect(threadApi.edit(id, 'Terlambat.')).rejects.toMatchObject({ code: 'edit_window' });
  });

  it('notifies mentions and aggregates new-comment notifications per thread', async () => {
    as('usr-hendra');
    await post({ body: '@Siti Rahmawati mohon cek.', mentionUserIds: ['usr-siti'] });
    await post({ body: 'Tambahan kedua.' });
    const db = getDb();
    expect(
      db.notifications.some(
        (n) =>
          n.userId === 'usr-siti' &&
          n.kind === 'mention' &&
          n.text.startsWith('Hendra Gunawan menyebut Anda di utas'),
      ),
    ).toBe(true);
    const forAndi = db.notifications.filter(
      (n) =>
        n.userId === 'usr-andi' &&
        n.kind === 'thread_comments' &&
        !n.readAt &&
        n.targetUrl.endsWith('rr-a1-pembayaran'),
    );
    expect(forAndi).toHaveLength(1);
    expect(forAndi[0]!.text).toMatch(/^2 komentar baru di/);
    expect(
      db.subscriptions.some(
        (s) => s.userId === 'usr-siti' && s.registerRiskId === 'rr-a1-pembayaran' && !s.muted,
      ),
    ).toBe(true);
  });

  it('does not let holders unfollow their own threads', async () => {
    as('usr-rafi');
    await expect(threadApi.follow('rr-a1-pembayaran', false)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('visibility in the read models (VIS-1/3/9)', () => {
  it('masks confidential files for non-Lini 3 viewers', () => {
    const c = (userId: string) =>
      buildThread(getDb(), userId, 'rr-a1-pemecahan', AT)
        .timeline.flatMap((g) => g.comments)
        .find((x) => x.id === 'cm-10')!;
    expect(c('usr-andi').confidentialHidden).toBe(1);
    expect(c('usr-andi').attachments.map((a) => a.attachment.filename)).toEqual([
      'Daftar_Kontrak_Februari.pdf',
    ]);
    expect(c('usr-maya').confidentialHidden).toBe(0);
  });

  it('hides Lini 3 drafts from Lini 1 before the comparison opens (VIS-1)', () => {
    const card = buildThread(getDb(), 'usr-andi', 'rr-a1-pemecahan', AT).panel.find(
      (p) => p.quarter.id === 'q-2027-2',
    )!;
    expect(card.visible.every((a) => a.line === 1)).toBe(true);
    expect(card.hiddenLabels.length).toBeGreaterThan(0);
  });

  it('shows no predicate chips before results open on the clock', () => {
    const board = buildBoard(getDb(), 'usr-andi', 'pos-ppk-a1', 2027, '2027-03-20T09:00');
    const row = board.groups
      .flatMap((g) => g.types.flatMap((t) => t.rows))
      .find((r) => r.risk.id === 'rr-a1-pemecahan')!;
    expect(row.opened).toBeNull();
  });

  it('a late directorate sees no predicates or markers for that quarter (VIS-9)', () => {
    const db = getDb();
    const board = buildBoard(db, 'usr-maya', 'pos-ppk-a1', 2027, '2027-04-04T09:00');
    const rows = board.groups.flatMap((g) => g.types.flatMap((t) => t.rows));
    expect(rows.some((r) => r.opened?.hidden)).toBe(true);
    for (const row of board.groups.flatMap((g) => g.types.flatMap((t) => t.rows))) {
      if (row.opened?.hidden) {
        expect(row.opened.chips).toEqual([]);
        expect(row.markers).not.toContain('tidak-sesuai');
      }
    }
  });
});
