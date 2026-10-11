// Sheets and print — PRD ch. 9 (FR-LBR-001 … 010). Live view and snapshots share one payload
// shape; snapshots are immutable (INV-22) except `supersededById`.

import { holdingsOf, participationHolding } from '@/domain/rules/access';
import {
  buildSheetPayload,
  freezeReady,
  maskPayloadFor,
  snapshotNumber,
  type SheetPayload,
  type SheetSection,
} from '@/domain/rules/sheetPayload';
import type { ISODateTime, PrintSnapshot, Quarter } from '@/domain/types';
import { now } from '@/state/clock';
import { useSession } from '@/state/session';
import type { DB } from '../db';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { newId, writeAudit } from '../local/writers';

/** Shared (not per-user) photo selection lives in preferences under this pseudo user. */
const SHARED = '*';
const photoKey = (positionId: string, quarterId: string, sec: SheetSection) =>
  `lembar-foto:${positionId}:${quarterId}:${sec}`;

export function photoSelection(
  db: DB,
  positionId: string,
  quarterId: string,
): Partial<Record<SheetSection, string[]>> {
  const out: Partial<Record<SheetSection, string[]>> = {};
  for (const sec of ['A', 'B', 'C'] as const) {
    const v = db.preferences.find(
      (p) => p.userId === SHARED && p.key === photoKey(positionId, quarterId, sec),
    )?.value;
    if (Array.isArray(v)) out[sec] = v as string[];
  }
  return out;
}

export interface SnapshotInfo {
  id: string;
  number: string;
  kind: 'komunikasi' | 'mutu';
  version: number | null;
  trigger: PrintSnapshot['trigger'];
  isProvisional: boolean;
  supersededByVersion: number | null;
  createdBy: string;
  createdAt: ISODateTime;
}

export interface SheetView {
  quarter: Quarter;
  quarters: Quarter[];
  payload: SheetPayload;
  masked: string[];
  snapshot: SnapshotInfo | null;
  snapshots: SnapshotInfo[];
  /** Latest automatic version number per kind (null = none yet → prints are provisional). */
  latestVersion: number | null;
  canPick: Record<SheetSection, boolean>;
  published: boolean;
}

function info(db: DB, s: PrintSnapshot): SnapshotInfo {
  const next = s.supersededById ? db.snapshots.find((x) => x.id === s.supersededById) : undefined;
  return {
    id: s.id,
    number: s.number,
    kind: s.kind,
    version: s.version,
    trigger: s.trigger,
    isProvisional: s.isProvisional,
    supersededByVersion: next?.version ?? null,
    createdBy: s.createdByUserId
      ? (db.users.find((u) => u.id === s.createdByUserId)?.fullName ?? '')
      : 'Sistem',
    createdAt: s.createdAt,
  };
}

const latestAuto = (db: DB, positionId: string, quarterId: string, kind: PrintSnapshot['kind']) =>
  db.snapshots
    .filter(
      (s) =>
        s.positionId === positionId &&
        s.quarterId === quarterId &&
        s.kind === kind &&
        s.trigger !== 'print',
    )
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];

function sessionUser() {
  const userId = useSession.getState().userId;
  if (!userId) throw new ApiError('unauthenticated', 'Sesi Anda berakhir. Silakan masuk kembali.');
  return userId;
}

export function buildSheetView(
  db: DB,
  userId: string,
  positionId: string,
  fiscalYear: number,
  tw: number,
  snapshotId: string | null,
  at: ISODateTime,
): SheetView {
  const today = at.slice(0, 10);
  const quarter = db.quarters.find((q) => q.fiscalYear === fiscalYear && q.number === tw);
  if (!quarter)
    throw new ApiError('not_found', `Triwulan TW ${tw} TA ${fiscalYear} tidak ditemukan.`);
  const register = db.registers.find(
    (r) => r.positionId === positionId && r.fiscalYear === fiscalYear,
  );
  const published =
    !!register &&
    (register.status === 'published' || register.status === 'archived' || !!register.publishedAt);
  const snap = snapshotId
    ? db.snapshots.find((s) => s.id === snapshotId && s.positionId === positionId)
    : undefined;
  if (snapshotId && !snap) throw new ApiError('not_found', 'Salinan beku tidak ditemukan.');
  const neutral = snap
    ? (snap.payload as SheetPayload)
    : buildSheetPayload(db, positionId, quarter, at, photoSelection(db, positionId, quarter.id));
  const lini3 = holdingsOf(db, userId, today)
    .filter((h) => h.line === 3)
    .map((h) => h.positionId);
  const { payload, masked } = maskPayloadFor(neutral, lini3);
  const holding = (line: 1 | 2 | 3) => {
    const h = participationHolding(db, userId, positionId, quarter.id, today);
    return !!h && h.line === line;
  };
  const archived = db.fiscalYears.find((f) => f.year === fiscalYear)?.status === 'archived';
  return {
    quarter,
    quarters: db.quarters
      .filter((q) => q.fiscalYear === fiscalYear)
      .sort((a, b) => a.number - b.number),
    payload,
    masked,
    snapshot: snap ? info(db, snap) : null,
    snapshots: db.snapshots
      .filter((s) => s.positionId === positionId && s.quarterId === quarter.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => info(db, s)),
    latestVersion: latestAuto(db, positionId, quarter.id, 'komunikasi')?.version ?? null,
    canPick: { A: !archived && holding(1), B: !archived && holding(2), C: !archived && holding(3) },
    published,
  };
}

function createSnapshot(
  d: DB,
  kind: PrintSnapshot['kind'],
  positionId: string,
  quarter: Quarter,
  payload: SheetPayload,
  trigger: PrintSnapshot['trigger'],
  userId: string | null,
  at: ISODateTime,
) {
  const auto = latestAuto(d, positionId, quarter.id, kind);
  const version = trigger === 'print' ? (auto?.version ?? null) : (auto?.version ?? 0) + 1;
  const snap: PrintSnapshot = {
    id: newId('snap'),
    number: snapshotNumber(d, kind, positionId, quarter),
    positionId,
    quarterId: quarter.id,
    kind,
    version,
    trigger,
    isProvisional: trigger === 'print' && !auto,
    supersededById: null,
    payload,
    createdByUserId: userId,
    createdAt: at,
  };
  d.snapshots.push(snap);
  if (trigger !== 'print' && auto)
    d.snapshots.find((s) => s.id === auto.id)!.supersededById = snap.id;
  writeAudit(d, {
    at,
    actorUserId: userId,
    actingAs: userId ? null : 'sistem',
    actingPositionId: null,
    action: trigger === 'print' ? 'cetak_lembar' : 'bekukan_lembar',
    entityType: 'PrintSnapshot',
    entityId: snap.id,
    before: null,
    after: { number: snap.number, version, trigger },
  });
  return snap;
}

const strip = (p: SheetPayload) => JSON.stringify({ ...p, builtAt: '' });

/**
 * FR-LBR-009: freeze each position-quarter automatically once ready; a new version whenever the
 * content changed since the last automatic one. Archived years are left untouched.
 */
export function runSheetFreeze(d: DB, at: ISODateTime) {
  const open = new Set(d.fiscalYears.filter((f) => f.status !== 'archived').map((f) => f.year));
  const lini1 = d.positions.filter(
    (p) => d.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1,
  );
  for (const q of d.quarters.filter(
    (x) => open.has(x.fiscalYear) && x.lini3OpensOn <= at.slice(0, 10),
  )) {
    for (const p of lini1) {
      if (!freezeReady(d, p.id, q, at)) continue;
      const payload = buildSheetPayload(d, p.id, q, at, photoSelection(d, p.id, q.id));
      const last = latestAuto(d, p.id, q.id, 'komunikasi');
      if (last && strip(last.payload as SheetPayload) === strip(payload)) continue;
      createSnapshot(d, 'komunikasi', p.id, q, payload, 'auto_freeze', null, at);
      createSnapshot(d, 'mutu', p.id, q, payload, 'auto_freeze', null, at);
    }
  }
}

export const sheetApi = {
  view: (positionId: string, fiscalYear: number, tw: number, snapshotId: string | null) =>
    call(() =>
      buildSheetView(getDb(), sessionUser(), positionId, fiscalYear, tw, snapshotId, now()),
    ),

  /** FR-LBR-005: participants of that line choose up to 5 images per section. */
  setPhotos: (
    positionId: string,
    quarterId: string,
    section: SheetSection,
    attachmentIds: string[],
  ) =>
    call(() => {
      const userId = sessionUser();
      const at = now();
      if (attachmentIds.length > 5) throw new ApiError('validation', 'Maksimal 5 foto per bagian');
      const h = participationHolding(getDb(), userId, positionId, quarterId, at.slice(0, 10));
      const line = section === 'A' ? 1 : section === 'B' ? 2 : 3;
      if (!h || h.line !== line)
        throw new ApiError(
          'forbidden',
          `Foto Bagian ${section} dipilih oleh peserta Lini ${line}.`,
        );
      mutateDb((d) => {
        const key = photoKey(positionId, quarterId, section);
        const pref = d.preferences.find((x) => x.userId === SHARED && x.key === key);
        if (pref) pref.value = attachmentIds;
        else d.preferences.push({ userId: SHARED, key, value: attachmentIds });
        writeAudit(d, {
          at,
          actorUserId: userId,
          actingAs: h.capacity,
          actingPositionId: h.positionId,
          action: 'pilih_foto_lembar',
          entityType: 'Quarter',
          entityId: quarterId,
          before: null,
          after: { section, attachmentIds },
        });
      });
    }),

  /** FR-LBR-006: printing the live view creates snapshots first; returns them to print from. */
  print: (positionId: string, fiscalYear: number, tw: number, kinds: PrintSnapshot['kind'][]) =>
    call<string[]>(() => {
      const userId = sessionUser();
      const at = now();
      const db = getDb();
      const q = db.quarters.find((x) => x.fiscalYear === fiscalYear && x.number === tw)!;
      const payload = buildSheetPayload(
        db,
        positionId,
        q,
        at,
        photoSelection(db, positionId, q.id),
      );
      const ids: string[] = [];
      mutateDb((d) => {
        for (const k of kinds)
          ids.push(createSnapshot(d, k, positionId, q, payload, 'print', userId, at).id);
      });
      return ids;
    }),

  /** FR-LBR-010: look a snapshot up by its printed number. */
  findByNumber: (number: string) =>
    call(() => {
      const db = getDb();
      const s = db.snapshots.find((x) => x.number.toLowerCase() === number.trim().toLowerCase());
      if (!s) throw new ApiError('not_found', `Nomor cetak "${number.trim()}" tidak ditemukan.`);
      const q = db.quarters.find((x) => x.id === s.quarterId)!;
      return {
        id: s.id,
        positionId: s.positionId,
        fiscalYear: q.fiscalYear,
        tw: q.number,
        kind: s.kind,
      };
    }),
};
