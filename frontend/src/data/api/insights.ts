// Product metrics (FR-ADM-011) and the audit trail (FR-ADM-008, VIS-8).

import { QUARTER_ROMAN } from '@/domain/calendar';
import { hasPermission, holdingsOf, permissionScopes } from '@/domain/rules/access';
import { assessmentFrozen, optionLabelOf, quarterRisks } from '@/domain/rules/assessment';
import { hasLangkah, openedResults } from '@/domain/rules/board';
import { REDACTED, REDACTED_FILE } from '@/domain/rules/visibility';
import type { AuditLog, ISODateTime } from '@/domain/types';
import { now } from '@/state/clock';
import type { DB } from '../db';
import { requireActor } from '../local/actor';
import { ApiError, call } from '../local/call';
import { getDb, mutateDb } from '../local/store';
import { writeAudit } from '../local/writers';

/* ---------- Metrics ---------- */

export interface MetricPoint {
  label: string;
  value: number | null;
  numerator: number;
  denominator: number;
}

export interface MetricCard {
  objective: number;
  title: string;
  target: string;
  query: string;
  /** Headline value (ratio 0–1, count, or minutes); null → "Data belum cukup". */
  value: number | null;
  unit: 'percent' | 'count' | 'minutes';
  status: string;
  insufficient: string | null;
  points: MetricPoint[];
}

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
const lini1Positions = (db: DB) =>
  db.positions.filter((p) => db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 1);

export function buildMetrics(db: DB, year: number, at: ISODateTime): MetricCard[] {
  const today = at.slice(0, 10);
  const regs = db.registers.filter(
    (r) =>
      r.fiscalYear === year &&
      (r.publishedAt || r.status === 'published' || r.status === 'archived'),
  );
  const regIds = new Set(regs.map((r) => r.id));
  const published = db.risks.filter(
    (r) => regIds.has(r.registerId) && (r.status === 'active' || r.status === 'inactive'),
  );
  const quarters = db.quarters
    .filter((q) => q.fiscalYear === year)
    .sort((a, b) => a.number - b.number);
  const started = quarters.filter((q) => q.startsOn <= today);
  const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;

  // 1. Templates.
  const fromTpl = published.filter((r) => !r.isCustom).length;
  const m1: MetricCard = {
    objective: 1,
    title: 'Risiko dari template pusat',
    target: '≥ 80%',
    query: 'RegisterRisk terbit TA terpilih: risk_template_id terisi ÷ semua',
    value: ratio(fromTpl, published.length),
    unit: 'percent',
    status: '',
    insufficient: published.length ? null : 'Belum ada register yang terbit pada TA ini.',
    points: [
      {
        label: `TA ${year}`,
        value: ratio(fromTpl, published.length),
        numerator: fromTpl,
        denominator: published.length,
      },
    ],
  };

  // 2. Langkah coverage per quarter (RB-REG-006).
  const p2 = started.map<MetricPoint>((q) => {
    const items = lini1Positions(db).flatMap((p) => quarterRisks(db, p.id, q));
    const withStep = items.filter(({ risk }) => hasLangkah(db, risk.id, q.id)).length;
    return {
      label: tw(q.number),
      value: ratio(withStep, items.length),
      numerator: withStep,
      denominator: items.length,
    };
  });
  const last2 = [...p2].reverse().find((p) => p.denominator > 0);
  const m2: MetricCard = {
    objective: 2,
    title: 'Risiko dengan Langkah Lini 1 per triwulan',
    target: '≥ 80%',
    query:
      'Risiko dinilai pada triwulan (RB-REG-006) dengan ≥ 1 komentar Langkah Lini 1 pada triwulan itu ÷ semua',
    value: last2?.value ?? null,
    unit: 'percent',
    status: '',
    insufficient: last2 ? null : 'Belum ada triwulan berjalan dengan risiko terbit.',
    points: p2,
  };

  // 3. Evidence completeness of final Lini 1 scores.
  const p3 = started.map<MetricPoint>((q) => {
    const rqIds = new Set(db.riskQuarters.filter((r) => r.quarterId === q.id).map((r) => r.id));
    const finals = db.assessments.filter(
      (a) =>
        rqIds.has(a.riskQuarterId) &&
        a.assessorLine === 1 &&
        a.status === 'final' &&
        !a.notRelevant,
    );
    const withFile = finals.filter((a) => !a.flags.includes('no_evidence')).length;
    return {
      label: tw(q.number),
      value: ratio(withFile, finals.length),
      numerator: withFile,
      denominator: finals.length,
    };
  });
  const last3 = [...p3].reverse().find((p) => p.denominator > 0);
  const m3: MetricCard = {
    objective: 3,
    title: 'Penilaian Lini 1 dengan bukti',
    target: '≥ 90%',
    query: 'Assessment Lini 1 final (bukan Belum relevan) tanpa penanda no_evidence ÷ semua final',
    value: last3?.value ?? null,
    unit: 'percent',
    status: '',
    insufficient: last3 ? null : 'Belum ada penilaian Lini 1 yang dituntaskan.',
    points: p3,
  };

  // 4. Recurring risks and explanations (VIS-7: opened results only).
  const recurring = db.riskQuarters.filter(
    (rq) =>
      quarters.some((q) => q.id === rq.quarterId) &&
      rq.recurring &&
      openedResults(db, rq.id, at).length > 0,
  );
  const explained = recurring.filter((rq) =>
    openedResults(db, rq.id, at).some((r) => r.explanationStatus === 'sent'),
  ).length;
  const m4: MetricCard = {
    objective: 4,
    title: 'Risiko Berulang terdeteksi',
    target: 'Semua ditandai & diberitahukan',
    query: 'RiskQuarter recurring = true (hasil terbuka) · dengan penjelasan terkirim',
    value: recurring.length,
    unit: 'count',
    status: `${explained} dari ${recurring.length} menerima penjelasan`,
    insufficient: started.length ? null : 'Belum ada triwulan berjalan.',
    points: started.map((q) => {
      const r = recurring.filter((x) => x.quarterId === q.id);
      const e = r.filter((x) =>
        openedResults(db, x.id, at).some((y) => y.explanationStatus === 'sent'),
      ).length;
      return { label: tw(q.number), value: r.length, numerator: e, denominator: r.length };
    }),
  };

  // 8. Time on task — requires time-on-page instrumentation.
  const m8: MetricCard = {
    objective: 8,
    title: 'Median waktu menuntaskan penilaian triwulan',
    target: '< 30 menit',
    query: 'Median waktu-di-halaman per jabatan per triwulan hingga Tuntaskan Penilaian',
    value: null,
    unit: 'minutes',
    status: '',
    insufficient:
      'Instrumentasi waktu-di-halaman belum tersedia di prototipe; angka tidak ditebak dari selisih waktu.',
    points: [],
  };

  // 9. Alignment per quarter and per Lini 3 position.
  const lini3 = db.positions.filter(
    (p) => db.positionTypes.find((t) => t.id === p.positionTypeId)?.line === 3,
  );
  const p9: MetricPoint[] = started.flatMap((q) => {
    const results = db.results.filter(
      (r) =>
        db.riskQuarters.find((x) => x.id === r.riskQuarterId)?.quarterId === q.id &&
        r.openedAt <= at &&
        r.result !== 'incomparable',
    );
    return [
      {
        label: tw(q.number),
        value: ratio(results.filter((r) => r.result === 'sesuai').length, results.length),
        numerator: results.filter((r) => r.result === 'sesuai').length,
        denominator: results.length,
      },
      ...lini3.map((p) => {
        const own = results.filter((r) => r.lini3PositionId === p.id);
        const s = own.filter((r) => r.result === 'sesuai').length;
        return {
          label: `${tw(q.number)} · ${p.shortName ?? p.code}`,
          value: ratio(s, own.length),
          numerator: s,
          denominator: own.length,
        };
      }),
    ];
  });
  const last9 = [...p9].reverse().find((p) => p.denominator > 0 && !p.label.includes('·'));
  const m9: MetricCard = {
    objective: 9,
    title: 'Tingkat kesesuaian Lini 1 dan Lini 3',
    target: 'Tanpa target v1.0 — garis dasar',
    query:
      'ComparisonResult terbuka: Sesuai ÷ (Sesuai + Tidak Sesuai), per triwulan dan per direktorat',
    value: last9?.value ?? null,
    unit: 'percent',
    status: '',
    insufficient: last9 ? null : 'Belum ada hasil perbandingan yang terbuka.',
    points: p9,
  };

  for (const m of [m1, m2, m3]) {
    const target = m.objective === 3 ? 0.9 : 0.8;
    m.status = m.value === null ? '' : m.value >= target ? 'Memenuhi target' : 'Di bawah target';
  }
  return [m1, m2, m3, m4, m8, m9];
}

export function metricsCsv(cards: MetricCard[], year: number): string {
  const lines = ['tujuan,judul,periode,nilai,pembilang,penyebut'];
  for (const c of cards)
    for (const p of c.points.length
      ? c.points
      : [{ label: `TA ${year}`, value: null, numerator: 0, denominator: 0 }])
      lines.push(
        [
          c.objective,
          `"${c.title}"`,
          `"${p.label}"`,
          p.value === null ? '' : c.unit === 'percent' ? (p.value * 100).toFixed(1) : p.value,
          p.numerator,
          p.denominator,
        ].join(','),
      );
  return lines.join('\n');
}

/* ---------- Audit trail ---------- */

export interface AuditRow extends AuditLog {
  actorName: string;
  positionName: string;
}

export interface AuditFilter {
  from?: string;
  to?: string;
  actor?: string;
  position?: string;
  entityType?: string;
  action?: string;
}

const SCORE_KEYS = new Set(['score', 'predicate', 'note']);

/** VIS-8: blind assessment values and confidential filenames are redacted in before/after. */
export function redact(
  db: DB,
  viewerId: string,
  entry: AuditLog,
  at: ISODateTime,
  original: boolean,
): AuditLog {
  if (original) return entry;
  const today = at.slice(0, 10);
  const canConfidential = hasPermission(db, viewerId, 10, today);
  const confidentialNames = canConfidential
    ? new Set<string>()
    : new Set(db.attachments.filter((a) => a.isConfidential).map((a) => a.filename));
  const assessment =
    entry.entityType === 'Assessment'
      ? db.assessments.find((a) => a.id === entry.entityId)
      : undefined;
  const blind = assessment ? !assessmentFrozen(db, assessment, at) : false;
  const walk = (v: unknown, key?: string): unknown => {
    if (blind && key && SCORE_KEYS.has(key) && v !== null && v !== undefined) return REDACTED;
    if (typeof v === 'string') return confidentialNames.has(v) ? REDACTED_FILE : v;
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return { ...entry, before: walk(entry.before), after: walk(entry.after) };
}

/** PRD v2.8: numbers in Assessment before/after read as the chosen statement. */
function labelScores(db: DB, entry: AuditLog): AuditLog {
  if (entry.entityType !== 'Assessment') return entry;
  const version = db.assessments.find((a) => a.id === entry.entityId)?.scoreBandVersionId ?? null;
  const swap = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const o = v as Record<string, unknown>;
    if (typeof o.score !== 'number') return v;
    return { ...o, score: optionLabelOf(db, version, o.score) ?? o.score };
  };
  return { ...entry, before: swap(entry.before), after: swap(entry.after) };
}

export function buildAudit(
  db: DB,
  viewerId: string,
  filter: AuditFilter,
  at: ISODateTime,
  original: boolean,
): AuditRow[] {
  const today = at.slice(0, 10);
  const scope = permissionScopes(db, viewerId, today).get(23);
  if (scope === undefined)
    throw new ApiError('forbidden', 'Anda tidak memiliki akses ke jejak audit.');
  const holdings = holdingsOf(db, viewerId, today);
  const units = new Set([
    ...holdings.map((h) => db.positions.find((p) => p.id === h.positionId)!.orgUnitId),
    db.users.find((u) => u.id === viewerId)?.orgUnitId,
  ]);
  return db.audit
    .filter((e) => {
      if (scope === 'semua') return true;
      if (scope === 'sendiri') return e.actorUserId === viewerId;
      const pos = db.positions.find((p) => p.id === e.actingPositionId);
      const actorUnit = db.users.find((u) => u.id === e.actorUserId)?.orgUnitId;
      return (pos && units.has(pos.orgUnitId)) || (actorUnit && units.has(actorUnit));
    })
    .filter(
      (e) =>
        (!filter.from || e.at.slice(0, 10) >= filter.from) &&
        (!filter.to || e.at.slice(0, 10) <= filter.to),
    )
    .filter(
      (e) =>
        (!filter.actor || e.actorUserId === filter.actor) &&
        (!filter.position || e.actingPositionId === filter.position),
    )
    .filter(
      (e) =>
        (!filter.entityType || e.entityType === filter.entityType) &&
        (!filter.action || e.action === filter.action),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((e) => ({
      ...(original ? e : labelScores(db, redact(db, viewerId, e, at, false))),
      actorName: e.actorUserId
        ? (db.users.find((u) => u.id === e.actorUserId)?.fullName ?? '')
        : 'Sistem',
      positionName: e.actingPositionId
        ? (db.positions.find((p) => p.id === e.actingPositionId)?.name ?? '')
        : '—',
    }));
}

export const insightsApi = {
  metrics: (year: number) =>
    call(() => {
      requireActor([22]);
      return buildMetrics(getDb(), year, now());
    }),

  audit: (filter: AuditFilter, original: boolean) =>
    call(() => {
      const a = requireActor([23]);
      if (original && !hasPermission(getDb(), a.userId, 24, a.today))
        throw new ApiError('forbidden', 'Menampilkan nilai asli memerlukan izin khusus.');
      return buildAudit(getDb(), a.userId, filter, a.at, original);
    }),

  /** FR-ADM-008: every use of "Tampilkan nilai asli" is logged. */
  logShowOriginal: () =>
    call(() => {
      const a = requireActor([24]);
      mutateDb((d) =>
        writeAudit(d, {
          at: a.at,
          actorUserId: a.userId,
          actingAs: a.actingAs,
          actingPositionId: null,
          action: 'tampilkan_nilai_asli',
          entityType: 'AuditLog',
          entityId: '*',
          before: null,
          after: null,
        }),
      );
    }),
};
