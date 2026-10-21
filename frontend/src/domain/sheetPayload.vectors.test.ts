import vectors from '@vectors/sheet-payload.json';
import type { DB } from '@/data/db';
import { loadVectors } from '@/test/vectors';
import {
  buildSheetPayload,
  freezeReady,
  maskPayloadFor,
  mutuFromPayload,
  snapshotNumber,
  type SheetSection,
} from './rules/sheetPayload';

// Shared with backend/tests/domain/test_sheet_payload_vectors.py (spec §4.9).
const v = loadVectors(vectors as Parameters<typeof loadVectors>[0]);

type In = { db: DB; at: string; selection?: Partial<Record<SheetSection, string[]>> };
const quarter = (db: DB, id: string) => db.quarters.find((q) => q.id === id)!;
const keysOf = (e: unknown) => Object.keys(e as object);

describe('shared vectors: sheet payload', () => {
  it.each(v.buildSheetPayload!)('buildSheetPayload $name', ({ input, expected }) => {
    const { db, at, selection } = input as In;
    const got = Object.fromEntries(
      keysOf(expected).map((key) => {
        const [p, qid] = key.split('|') as [string, string];
        const payload = buildSheetPayload(db, p, quarter(db, qid), at, selection);
        return [key, selection ? payload.photos : payload];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.maskPayloadFor!)('maskPayloadFor $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      keysOf(expected).map((key) => {
        const [p, qid, l3] = key.split('|') as [string, string, string];
        const m = maskPayloadFor(buildSheetPayload(db, p, quarter(db, qid), at), l3.split('+'));
        return [key, { masked: m.masked, mutu: mutuFromPayload(m.payload) }];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.mutuFromPayload!)('mutuFromPayload $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      keysOf(expected).map((key) => {
        const [p, qid] = key.split('|') as [string, string];
        return [key, mutuFromPayload(buildSheetPayload(db, p, quarter(db, qid), at))];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.freezeReady!)('freezeReady $name', ({ input, expected }) => {
    const { db, at } = input as In;
    const got = Object.fromEntries(
      keysOf(expected).map((key) => {
        const [p, qid] = key.split('|') as [string, string];
        return [key, freezeReady(db, p, quarter(db, qid), at)];
      }),
    );
    expect(got).toEqual(expected);
  });
  it.each(v.snapshotNumber!)('snapshotNumber $name', ({ input, expected }) => {
    const { db } = input as In;
    const got = Object.fromEntries(
      keysOf(expected).map((key) => {
        const [p, qid, kind] = key.split('|') as [string, string, 'komunikasi' | 'mutu'];
        return [key, snapshotNumber(db, kind, p, quarter(db, qid))];
      }),
    );
    expect(got).toEqual(expected);
  });
});
