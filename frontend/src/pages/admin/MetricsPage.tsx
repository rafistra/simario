import { Download } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  InlineAlert,
  LoadingRegion,
  PageHeader,
  Select,
  Skeleton,
} from '@/components';
import { metricsCsv, type MetricCard } from '@/data/api/insights';
import { insightsApi } from '@/data/repository';
import { useGateDb } from '@/components/DataGate/gateDb';
import { usePageMeta } from '@/layout/pageMeta';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/useAuth';
import './Admin.css';

const fmt = (c: MetricCard, v: number | null) =>
  v === null
    ? '—'
    : c.unit === 'percent'
      ? `${(v * 100).toFixed(1).replace('.', ',')}%`
      : c.unit === 'minutes'
        ? `${v} menit`
        : String(v);

/** UTF-8 byte-order mark so spreadsheet apps read the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** /metrik — FR-ADM-011 (objectives 1, 2, 3, 4, 8, 9). */
export default function MetricsPage() {
  usePageMeta(['Metrik']);
  const auth = useAuth();
  const years = useGateDb()
    .fiscalYears.map((f) => f.year)
    .sort((a, b) => b - a);
  const [year, setYear] = useState(Number(auth.today.slice(0, 4)));
  const q = useQuery(() => insightsApi.metrics(year), [year]);

  const download = () => {
    if (!q.data) return;
    const blob = new Blob([BOM + `${metricsCsv(q.data, year)}\n`], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metrik-simario-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengawasan"
        title="Metrik Produk"
        subtitle="Angka hanya dari hasil yang sudah dibuka (VIS-7)."
        actions={
          <span className="adm__actions">
            <Select
              label="Tahun anggaran"
              value={String(year)}
              onChange={(e) => setYear(Number(e.target.value))}
              options={years.map((y) => ({ value: String(y), label: `TA ${y}` }))}
            />
            <Button variant="secondary" icon={Download} onClick={download}>
              Unduh CSV
            </Button>
          </span>
        }
      />
      {q.loading && !q.data ? (
        <LoadingRegion>
          <div className="metrics">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={200} radius="lg" />
            ))}
          </div>
        </LoadingRegion>
      ) : q.error && !q.data ? (
        <InlineAlert variant="error" title="Metrik gagal dimuat" onRetry={q.retry}>
          {q.error.message}
        </InlineAlert>
      ) : (
        <div className="metrics">
          {q.data!.map((c) => (
            <Card
              key={c.objective}
              eyebrow={`Tujuan ${c.objective}`}
              title={c.title}
              aside={<span className="adm__sub">Target {c.target}</span>}
            >
              {c.insufficient && c.value === null ? (
                <p className="metric__none">
                  <strong>Data belum cukup</strong>
                  <span className="adm__sub">{c.insufficient}</span>
                </p>
              ) : (
                <p className="metric__value">
                  <span className="metric__figure">{fmt(c, c.value)}</span>
                  {c.status && (
                    <span
                      className={['metric__status', c.status.startsWith('Di bawah') && 'is-low']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {c.status}
                    </span>
                  )}
                </p>
              )}
              {c.points.length > 0 && (
                <ul className="metric__points">
                  {c.points.map((p) => (
                    <li key={p.label}>
                      <span className="metric__plabel">{p.label}</span>
                      <span className="metric__bar" aria-hidden>
                        <span
                          style={{
                            width: `${c.unit === 'percent' && p.value !== null ? p.value * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <span className="t-mono metric__pval">
                        {p.denominator === 0 && c.unit === 'percent'
                          ? 'Data belum cukup'
                          : `${fmt(c, p.value)} (${p.numerator}/${p.denominator})`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="metric__query">Kueri: {c.query}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
