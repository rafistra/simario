import { buildSeed } from '@/test/fake/seed';
import type { Assessment } from '../types';
import {
  canSeeAssessment,
  canSeeAttachment,
  canSeeResult,
  openedLini3,
  viewerFor,
} from './visibility';

const db = buildSeed();
const TODAY = '2027-04-06';
const EXPECTED = ['pos-kepatuhan', 'pos-pai'];

const find = (rq: string, pos: string) =>
  db.assessments.find((a) => a.riskQuarterId === rq && a.assessorPositionId === pos)!;

describe('VIS-1 blind phase (TW II, nothing opened)', () => {
  const rq = 'rq-rr-a1-pemecahan-q-2027-2';
  const draft = find(rq, 'pos-kepatuhan');
  const opened = openedLini3(db.results, rq);

  it('shows a draft only to its own directorate', () => {
    expect(canSeeAssessment(viewerFor(db, 'usr-hendra', TODAY), draft, opened, EXPECTED)).toBe(
      true,
    );
    expect(canSeeAssessment(viewerFor(db, 'usr-rizky', TODAY), draft, opened, EXPECTED)).toBe(true);
    expect(canSeeAssessment(viewerFor(db, 'usr-maya', TODAY), draft, opened, EXPECTED)).toBe(false);
    expect(canSeeAssessment(viewerFor(db, 'usr-andi', TODAY), draft, opened, EXPECTED)).toBe(false);
    expect(canSeeAssessment(viewerFor(db, 'usr-siti', TODAY), draft, opened, EXPECTED)).toBe(false);
  });

  it('lets Superadmin see it only through an explicit blind view (FR-NIL-012)', () => {
    expect(canSeeAssessment(viewerFor(db, 'usr-admin', TODAY), draft, opened, EXPECTED)).toBe(
      false,
    );
    expect(canSeeAssessment(viewerFor(db, 'usr-admin', TODAY, true), draft, opened, EXPECTED)).toBe(
      true,
    );
    // Permission 24 is required: a blind-view flag alone grants nothing.
    expect(canSeeAssessment(viewerFor(db, 'usr-andi', TODAY, true), draft, opened, EXPECTED)).toBe(
      false,
    );
  });
});

describe('VIS-2 / VIS-9 after opening', () => {
  it('opens everything once both results are open (TW I, Pemecahan kontrak)', () => {
    const rq = 'rq-rr-a1-pemecahan-q-2027-1';
    const opened = openedLini3(db.results, rq);
    expect([...opened].sort()).toEqual(EXPECTED);
    const andi = viewerFor(db, 'usr-andi', TODAY);
    expect(canSeeAssessment(andi, find(rq, 'pos-pai'), opened, EXPECTED)).toBe(true);
    expect(canSeeAssessment(andi, find(rq, 'pos-ppk-a1'), opened, EXPECTED)).toBe(true);
  });

  it('keeps a late directorate blind to others even after their results open (Satker B, PAI not final)', () => {
    const rq = 'rq-rr-pjp-konflik-q-2027-1';
    const opened = openedLini3(db.results, rq);
    expect([...opened]).toEqual(['pos-kepatuhan']);
    const maya = viewerFor(db, 'usr-maya', TODAY);
    expect(canSeeAssessment(maya, find(rq, 'pos-kepatuhan'), opened, EXPECTED)).toBe(false);
    expect(canSeeAssessment(maya, find(rq, 'pos-pjp-satker-b'), opened, EXPECTED)).toBe(false);
    expect(canSeeResult(maya, opened, EXPECTED)).toBe(false);
    // Lini 1 and Lini 2 see the opened Kepatuhan result.
    const wulan = viewerFor(db, 'usr-wulan', TODAY);
    expect(canSeeAssessment(wulan, find(rq, 'pos-kepatuhan'), opened, EXPECTED)).toBe(true);
    expect(canSeeResult(wulan, opened, EXPECTED)).toBe(true);
  });

  it('never reveals an assessment that has not opened to the other side', () => {
    const fake: Assessment = {
      ...find('rq-rr-pjp-konflik-q-2027-1', 'pos-kepatuhan'),
      assessorPositionId: 'pos-pai',
    };
    const opened = openedLini3(db.results, 'rq-rr-pjp-konflik-q-2027-1');
    expect(canSeeAssessment(viewerFor(db, 'usr-wulan', TODAY), fake, opened, EXPECTED)).toBe(false);
  });
});

describe('VIS-3 confidential attachments', () => {
  const confidential = db.attachments.find((a) => a.isConfidential)!;

  it('serves them only to permission 10 holders', () => {
    expect(confidential.filename).toBe('Kertas_Kerja_Kepatuhan_Paket_Lisensi.xlsx');
    expect(canSeeAttachment(viewerFor(db, 'usr-maya', TODAY), confidential)).toBe(true);
    expect(canSeeAttachment(viewerFor(db, 'usr-admin', TODAY), confidential)).toBe(true);
    expect(canSeeAttachment(viewerFor(db, 'usr-andi', TODAY), confidential)).toBe(false);
    expect(canSeeAttachment(viewerFor(db, 'usr-siti', TODAY), confidential)).toBe(false);
    expect(canSeeAttachment(viewerFor(db, 'usr-nur', TODAY), confidential)).toBe(false);
  });
});
