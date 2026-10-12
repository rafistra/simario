import { ArrowRight, CalendarClock, Copy, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Card,
  EmptyState,
  InlineAlert,
  LineChip,
  LoadingRegion,
  MarkerBadge,
  PageHeader,
  Skeleton,
  StatusChip,
} from '@/components';
import type { ActivityRow, HomeView, Obligation } from '@/data/api/home';
import { homeApi } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import type { LembarMutu } from '@/domain/rules/sheets';
import { PREDICATE_INITIAL as SHORT, RISK_TYPE_LABEL } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatDateLong, formatRelative, formatScore } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useNow } from '@/state/clock';
import { useAuth } from '@/state/useAuth';
import './Home.css';

const tw = (q: { number: number; fiscalYear: number }) =>
  `TW ${QUARTER_ROMAN[q.number - 1]} ${q.fiscalYear}`;

/** Home (/) — FR-BRD-001 … 010; cards follow the active holding's line. */
export default function HomePage() {
  const auth = useAuth();
  usePageMeta(['Beranda']);
  const active = auth.active;
  const q = useQuery(
    () => homeApi.home(active?.positionId ?? null),
    [active?.positionId ?? null, auth.user.id],
  );
  const greeting = active
    ? `Selamat datang, ${auth.user.fullName}. Anda bekerja sebagai ${active.capacity === 'pejabat' ? 'Pejabat' : 'Operator'} ${active.position.name}${active.line === 1 ? ` · ${active.unitCode}` : ''}.`
    : `Selamat datang, ${auth.user.fullName}.`;

  return (
    <div className="home">
      <PageHeader eyebrow={formatDateLong(auth.today)} title="Beranda" subtitle={greeting} />
      {q.loading && !q.data ? (
        <LoadingRegion label="Memuat beranda…">
          <div className="home__grid">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} height={160} radius="lg" />
            ))}
          </div>
        </LoadingRegion>
      ) : q.error && !q.data ? (
        <InlineAlert variant="error" title="Beranda gagal dimuat" onRetry={q.retry}>
          {q.error.message}
        </InlineAlert>
      ) : (
        <Cards view={q.data!} />
      )}
    </div>
  );
}

function Cards({ view }: { view: HomeView }) {
  const at = useNow(60_000);
  const blocks: React.ReactNode[] = [];
  const l1 = view.lini1;
  if (l1) {
    for (const o of l1.obligations)
      blocks.push(
        <ObligationCard key={o.quarter.id} o={o} title={`Penilaian ${tw(o.quarter)}`} line={1} />,
      );
    if (l1.upcoming)
      blocks.push(
        <p key="upcoming" className="home__muted">
          <CalendarClock aria-hidden /> Penilaian TW {QUARTER_ROMAN[l1.upcoming.quarter.number - 1]}{' '}
          dibuka mulai {formatDate(l1.upcoming.opensOn)}
        </p>,
      );
    if (l1.register)
      blocks.push(
        <Card
          key="register"
          eyebrow="Register"
          title={`Register TA ${l1.register.fiscalYear} belum diterbitkan`}
          aside={
            <StatusChip
              status={l1.register.status === 'siap' ? 'siap' : 'draf'}
              label={l1.register.status === 'belum' ? 'Belum disusun' : undefined}
            />
          }
        >
          <div className="home__actions">
            <Link className="btn btn--secondary" to={l1.register.href}>
              <span>Buka Register</span>
            </Link>
            {l1.register.canCopy && (
              <Link className="btn btn--primary" to={l1.register.href}>
                <Copy className="btn__icon" aria-hidden />
                <span>Salin dari TA {l1.register.fiscalYear - 1}</span>
              </Link>
            )}
          </div>
        </Card>,
      );
    if (l1.actions.length)
      blocks.push(
        <Card
          key="actions"
          eyebrow="Perlu tindakan"
          title={`${l1.actions.length} hal menunggu Anda`}
        >
          <ul className="home__list">
            {l1.actions.map((a) => (
              <li key={a.text}>
                <Link
                  to={a.href}
                  className={['home__action', a.urgent && 'is-urgent'].filter(Boolean).join(' ')}
                >
                  <span>{a.text}</span>
                  <ArrowRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>,
      );
  }
  if (view.lini2) {
    blocks.push(
      <Card
        key="coord"
        className="home__wide"
        eyebrow={
          view.lini2.quarter
            ? `Jabatan dikoordinasikan · ${tw(view.lini2.quarter)}`
            : 'Jabatan dikoordinasikan'
        }
        title={`${view.lini2.rows.length} jabatan Lini 1`}
        aside={
          <Link className="text-link" to="/pantauan">
            Lihat semua
          </Link>
        }
      >
        {view.lini2.rows.length === 0 ? (
          <p className="home__muted">
            Belum ada jabatan yang ditugaskan kepada Anda untuk triwulan ini.
          </p>
        ) : (
          <ul className="home__table">
            {view.lini2.rows.slice(0, 8).map((r) => (
              <li key={r.positionId}>
                <Link to={r.href} className="home__trow">
                  <span className="home__tname">
                    {r.name}
                    <span className="home__tsub">{r.unit}</span>
                  </span>
                  <span className="t-mono home__tnum">{r.assessed} risiko</span>
                  <span>
                    {r.quiet ? (
                      <MarkerBadge kind="belum-langkah" label={`${r.quiet} belum ada langkah`} />
                    ) : (
                      <span className="home__ok">Semua risiko ada langkah</span>
                    )}
                  </span>
                  <span className="t-mono home__tsub">
                    {r.lastActivity ? formatRelative(r.lastActivity, at) : '—'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>,
    );
  }
  if (view.lini3) {
    for (const o of view.lini3.obligations)
      blocks.push(
        <ObligationCard
          key={o.quarter.id}
          o={o}
          title={`${tw(o.quarter)}: ${o.done} dari ${o.total} risiko sudah dinilai oleh ${view.lini3.directorate}`}
          line={3}
        />,
      );
    const att = view.lini3.attention;
    if (att)
      blocks.push(
        <Card
          key="attention"
          eyebrow={`Perlu perhatian · ${tw(att.quarter)}`}
          title="Hasil yang sudah dibuka untuk direktorat Anda"
        >
          <ul className="home__list">
            <li>
              <Link className="home__action" to="/penilaian">
                <span>{att.tidakSesuai} risiko Tidak Sesuai</span>
                <ArrowRight aria-hidden />
              </Link>
            </li>
            <li>
              <Link className="home__action" to="/penilaian">
                <span>{att.berulang} risiko Berulang</span>
                <ArrowRight aria-hidden />
              </Link>
            </li>
            <li>
              <Link className="home__action" to="/penilaian">
                <span>{att.notAssessed} risiko Tidak dinilai Lini 1</span>
                <ArrowRight aria-hidden />
              </Link>
            </li>
          </ul>
        </Card>,
      );
  }
  if (view.health) {
    const issues = view.health.filter((h) => h.count > 0);
    blocks.push(
      <Card
        key="health"
        className="home__wide"
        eyebrow="Kesehatan konfigurasi"
        title={issues.length ? `${issues.length} hal perlu dilengkapi` : 'Konfigurasi lengkap.'}
      >
        {issues.length === 0 ? (
          <InlineAlert variant="success" title="Konfigurasi lengkap." />
        ) : (
          <ul className="home__list">
            {issues.map((h) => (
              <li key={h.label}>
                <Link className="home__action" to={h.href}>
                  <span>
                    <strong className="t-mono">{h.count}</strong> {h.label}
                    <span className="home__tsub">
                      {' '}
                      — {h.items.slice(0, 4).join(', ')}
                      {h.items.length > 4 ? ', …' : ''}
                    </span>
                  </span>
                  <ArrowRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>,
    );
  }
  if (view.pmd)
    blocks.push(
      <Card
        key="pmd"
        className="home__wide"
        eyebrow="Pengelola Master Data"
        title="Kelola data referensi"
      >
        <ul className="home__links">
          {[
            ['Jabatan', '/master/jabatan'],
            ['Tahap', '/master/tahap'],
            ['Template Risiko', '/master/template'],
            [
              `Usulan${view.pmd.proposals ? ` (${view.pmd.proposals} menunggu)` : ''}`,
              '/master/usulan',
            ],
            ['Data Umum', '/master/data-umum'],
            ['Skala Penilaian', '/master/skala-penilaian'],
          ].map(([label, to]) => (
            <li key={to}>
              <Link className="home__action" to={to!}>
                <span>{label}</span>
                <ArrowRight aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>,
    );
  if (l1?.lastQuarter)
    blocks.push(
      <LastQuarterCard key="last" mutu={l1.lastQuarter.mutu} href={l1.lastQuarter.href} />,
    );
  if (view.activity && view.activity.length)
    blocks.push(<ActivityCard key="activity" rows={view.activity} />);

  if (blocks.length === 0)
    return <EmptyState icon={Inbox} title="Tidak ada yang perlu Anda kerjakan saat ini." />;
  return <div className="home__grid">{blocks}</div>;
}

/** ObligationCard: amber ≤ 7 days, red after the deadline with the lateness marker (FR-BRD-001/006). */
function ObligationCard({ o, title, line }: { o: Obligation; title: string; line: 1 | 3 }) {
  const tone = o.lateness ? 'is-late' : o.daysLeft <= 7 ? 'is-soon' : '';
  return (
    <Card
      className={['home__oblig', tone].filter(Boolean).join(' ')}
      eyebrow={`Kewajiban penilaian · Lini ${line}`}
      title={title}
      aside={
        o.lateness ? (
          <MarkerBadge kind={o.lateness === 'terlambat' ? 'terlambat' : 'sangat-terlambat'} />
        ) : undefined
      }
    >
      <p className="home__deadline">
        <CalendarClock aria-hidden /> Tenggat {formatDate(o.deadline)} ·{' '}
        {o.daysLeft > 0
          ? `${o.daysLeft} hari lagi`
          : o.daysLeft === 0
            ? 'hari ini'
            : `lewat ${-o.daysLeft} hari`}
      </p>
      <div
        className="home__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={o.total}
        aria-valuenow={o.done}
        aria-label="Kemajuan penilaian"
      >
        <span style={{ width: `${o.total ? (o.done / o.total) * 100 : 0}%` }} />
      </div>
      <div className="home__row">
        <span className="home__tsub">
          {o.done} dari {o.total} risiko sudah {line === 1 ? 'dituntaskan' : 'dinilai'}
        </span>
        <Link className="btn btn--primary" to={o.href}>
          <span>{line === 1 ? 'Buka Penilaian' : 'Buka Antrean'}</span>
        </Link>
      </div>
    </Card>
  );
}

/** FR-BRD-004: mini Lembar Mutu of the last quarter with an opened result (VIS-7). */
function LastQuarterCard({ mutu, href }: { mutu: LembarMutu; href: string }) {
  return (
    <Card
      className="home__wide"
      eyebrow="Hasil triwulan terakhir"
      title={`Lembar Mutu ${tw(mutu.quarter)}`}
      aside={
        <Link className="text-link" to={href}>
          Buka Lembar Mutu
        </Link>
      }
    >
      <div className="home__mutu" role="table" aria-label="Lembar Mutu ringkas">
        <div className="home__mrow home__mrow--head" role="row">
          <span role="columnheader">Jenis risiko</span>
          {mutu.assessors.map((a) => (
            <span key={a.positionId} role="columnheader">
              {a.label}
            </span>
          ))}
        </div>
        {mutu.rows.map((r) => (
          <div key={r.riskType} className="home__mrow" role="row">
            <span role="rowheader">{RISK_TYPE_LABEL[r.riskType]}</span>
            {r.cells.map((c, i) => (
              <span key={mutu.assessors[i]!.positionId} role="cell">
                {c.average !== null ? (
                  <>
                    <span className="t-mono">{formatScore(c.average)}</span>{' '}
                    {c.predicate && (
                      <span className={`mchip__pred mchip--${c.predicate}`}>
                        {SHORT[c.predicate]}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="home__tsub">{c.opened ? 'Tidak ada nilai' : 'Menunggu'}</span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="home__counts">
        <MarkerBadge kind="tidak-sesuai" label={`${mutu.tidakSesuai} Tidak Sesuai`} />{' '}
        <MarkerBadge kind="berulang" label={`${mutu.berulang} Berulang`} />
      </p>
    </Card>
  );
}

function ActivityCard({ rows }: { rows: ActivityRow[] }) {
  const at = useNow(60_000);
  return (
    <Card eyebrow="Aktivitas terbaru" title="Utas yang Anda ikuti">
      <ul className="home__activity">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={r.href} className="home__act">
              <span className="home__act-head">
                <LineChip line={r.line} />
                <strong>{r.author}</strong>
                <span className="home__tsub">{r.position}</span>
                <span className="home__tsub t-mono">· {formatRelative(r.at, at)}</span>
              </span>
              <span className="home__act-risk">{r.risk}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
