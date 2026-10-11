import rapim from '@seed/template_risiko_rapim.json';
import { predicateFor, validateBands } from '@/domain/scoreBands';
import { buildSeed } from '.';

const db = buildSeed();

describe('reference data from the Rapim deck', () => {
  it('imports 4 types, 14 stages, 146 risks, 302 mitigations', () => {
    expect(rapim.totals).toEqual({ positionTypes: 4, stages: 14, risks: 146, mitigations: 302 });
    expect(db.stages.filter((s) => s.active)).toHaveLength(14);
    expect(db.riskTemplates).toHaveLength(146);
    expect(db.mitigationTemplates).toHaveLength(302);
  });

  it('keeps every template-based register risk verbatim and in its stage and type', () => {
    for (const risk of db.risks.filter((r) => !r.isCustom)) {
      const tpl = db.riskTemplates.find((t) => t.id === risk.riskTemplateId);
      expect(tpl, risk.id).toBeDefined();
      expect(risk.descriptionSnapshot).toBe(tpl!.description);
      expect(risk.stageId).toBe(tpl!.stageId);
      expect(risk.riskType).toBe(tpl!.riskType);
    }
    for (const m of db.mitigations.filter((x) => !x.isCustom)) {
      const tpl = db.mitigationTemplates.find((t) => t.id === m.mitigationTemplateId);
      expect(m.descriptionSnapshot).toBe(tpl!.description);
    }
  });

  it('gives every custom published risk a proposal (FR-REG-004)', () => {
    const custom = db.risks.filter(
      (r) => r.isCustom && r.publishedAt && r.registerId.endsWith('2027'),
    );
    for (const r of custom)
      expect(db.proposals.some((p) => p.sourceRegisterRiskId === r.id)).toBe(true);
  });
});

describe('score bands', () => {
  it('has exactly one active, gap-free version (INV-3)', () => {
    const active = db.scoreBandVersions.filter((v) => v.status === 'active');
    expect(active).toHaveLength(1);
    expect(validateBands(db.scoreBands.filter((b) => b.versionId === active[0]!.id))).toEqual([]);
  });

  it('stores predicates consistent with the active bands', () => {
    const bands = db.scoreBands.filter((b) => b.versionId === 'sbv-1');
    for (const a of db.assessments.filter((x) => x.score !== null))
      expect(a.predicate, a.id).toBe(predicateFor(a.score!, bands));
  });
});

describe('TW I 2027 comparison for PPK A-1 (6 Apr 2027)', () => {
  const rqs = db.riskQuarters.filter(
    (rq) => rq.quarterId === 'q-2027-1' && rq.registerRiskId.startsWith('rr-a1'),
  );
  const results = db.results.filter((r) => rqs.some((rq) => rq.id === r.riskQuarterId));

  it('has every risk open with 5 Sesuai and 7 Tidak Sesuai, as the notification says', () => {
    expect(rqs).toHaveLength(7);
    expect(rqs.every((rq) => rq.comparisonStatus === 'open')).toBe(true);
    expect(results.filter((r) => r.result === 'sesuai')).toHaveLength(5);
    expect(results.filter((r) => r.result === 'tidak_sesuai')).toHaveLength(7);
    expect(results.filter((r) => r.result === 'incomparable')).toHaveLength(2);
  });

  it('requires explanations only where Lini 1 is higher, due 5 working days after opening', () => {
    const required = results.filter((r) => r.explanationRequired);
    expect(required).toHaveLength(5);
    expect(required.every((r) => r.lini1Higher)).toBe(true);
    const early = required.filter((r) => r.openedAt.startsWith('2027-04-02'));
    expect(new Set(early.map((r) => r.explanationDueOn))).toEqual(new Set(['2027-04-09']));
  });

  it('marks Pemecahan kontrak as Berulang across fiscal years', () => {
    expect(rqs.find((rq) => rq.registerRiskId === 'rr-a1-pemecahan')!.recurring).toBe(true);
    const prev = db.assessments.find((a) => a.id === 'as-rq-rr26-pemecahan-q-2026-4-pos-pai')!;
    expect(prev.predicate).toBe('kurang');
  });

  it('records PAI as late for the risks it finalised on 6 Apr', () => {
    const late = db.assessments.filter(
      (a) => a.assessorPositionId === 'pos-pai' && a.lateness === 'terlambat',
    );
    expect(late.map((a) => a.riskQuarterId).sort()).toEqual([
      'rq-rr-a1-material-q-2027-1',
      'rq-rr-a1-pembayaran-q-2027-1',
      'rq-rr-a1-penyuapan-q-2027-1',
    ]);
  });
});

describe('referential integrity', () => {
  it('points every foreign key at an existing row', () => {
    const ids = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
    const positions = ids(db.positions);
    const users = ids(db.users);
    const risks = ids(db.risks);
    for (const o of db.occupancies) {
      expect(positions.has(o.positionId)).toBe(true);
      expect(users.has(o.userId)).toBe(true);
    }
    for (const c of db.comments) {
      expect(risks.has(c.registerRiskId), c.id).toBe(true);
      expect(users.has(c.authorUserId)).toBe(true);
    }
    for (const a of db.attachments) expect(db.comments.some((c) => c.id === a.ownerId)).toBe(true);
    for (const rq of db.riskQuarters) expect(risks.has(rq.registerRiskId), rq.id).toBe(true);
    for (const audit of db.audit.filter((x) => x.entityType === 'Attachment'))
      expect(db.attachments.some((a) => a.id === audit.entityId)).toBe(true);
  });
});
