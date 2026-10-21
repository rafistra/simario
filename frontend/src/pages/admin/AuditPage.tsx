import { ChevronDown, Eye } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  DatePickerField,
  InlineAlert,
  LoadingRegion,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  toast,
} from '@/components';
import type { AuditFilter, AuditRow } from '@/test/fake/api/insights';
import { insightsApi } from '@/data/repository';
import { useGateDb } from '@/components/DataGate/gateDb';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/useAuth';
import './Admin.css';

const PAGE = 25;
const ACTING: Record<string, string> = {
  pejabat: 'Pejabat',
  operator: 'Operator',
  superadmin: 'Superadmin',
  pengelola: 'Pengelola',
  sistem: 'Sistem',
};
const label = (action: string) => action.replace(/_/g, ' ');

/** /jejak-audit — FR-ADM-008, VIS-8. */
export default function AuditPage() {
  usePageMeta(['Jejak Audit']);
  const auth = useAuth();
  const db = useGateDb();
  const [filter, setFilter] = useState<AuditFilter>({});
  const [original, setOriginal] = useState(false);
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const q = useQuery(() => insightsApi.audit(filter, original), [filter, original]);
  const canOriginal = auth.can(24);
  const facets = useQuery(() => insightsApi.auditFacets(), []);
  const actions = facets.data?.actions ?? [];
  const types = facets.data?.entityTypes ?? [];
  const set = (patch: AuditFilter) => {
    setFilter({ ...filter, ...patch });
    setPage(1);
  };
  const rows = q.data ?? [];
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengawasan"
        title="Jejak Audit"
        subtitle="Hanya tambah; kata sandi dan isi berkas tidak pernah dicatat."
        actions={
          canOriginal ? (
            original ? (
              <Button variant="secondary" onClick={() => setOriginal(false)}>
                Sembunyikan nilai asli
              </Button>
            ) : (
              <Button variant="secondary" icon={Eye} onClick={() => setAsk(true)}>
                Tampilkan nilai asli
              </Button>
            )
          ) : undefined
        }
      />
      {original && (
        <p className="assess__ribbon">
          Nilai asli ditampilkan · penggunaan ini tercatat di jejak audit
        </p>
      )}
      <div className="adm__filters audit__filters">
        <DatePickerField
          label="Dari"
          value={filter.from ?? ''}
          onChange={(e) => set({ from: e.target.value || undefined })}
        />
        <DatePickerField
          label="Sampai"
          value={filter.to ?? ''}
          onChange={(e) => set({ to: e.target.value || undefined })}
        />
        <Select
          label="Pelaku"
          value={filter.actor ?? ''}
          onChange={(e) => set({ actor: e.target.value || undefined })}
          options={[
            { value: '', label: 'Semua' },
            ...db.users.map((u) => ({ value: u.id, label: u.fullName })),
          ]}
        />
        <Select
          label="Jabatan"
          value={filter.position ?? ''}
          onChange={(e) => set({ position: e.target.value || undefined })}
          options={[
            { value: '', label: 'Semua' },
            ...db.positions.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <Select
          label="Entitas"
          value={filter.entityType ?? ''}
          onChange={(e) => set({ entityType: e.target.value || undefined })}
          options={[{ value: '', label: 'Semua' }, ...types.map((t) => ({ value: t, label: t }))]}
        />
        <Select
          label="Tindakan"
          value={filter.action ?? ''}
          onChange={(e) => set({ action: e.target.value || undefined })}
          options={[
            { value: '', label: 'Semua' },
            ...actions.map((a) => ({ value: a, label: label(a) })),
          ]}
        />
      </div>
      {q.loading && !q.data ? (
        <LoadingRegion>
          <Skeleton height={300} radius="lg" />
        </LoadingRegion>
      ) : q.error && !q.data ? (
        <InlineAlert variant="error" title="Jejak audit gagal dimuat" onRetry={q.retry}>
          {q.error.message}
        </InlineAlert>
      ) : (
        <>
          <p className="adm__sub">{rows.length} entri</p>
          <ul className="audit">
            {shown.map((r: AuditRow) => {
              const isOpen = open.has(r.id);
              return (
                <li key={r.id} className="audit__row">
                  <button
                    type="button"
                    className="audit__head"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (isOpen) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  >
                    <span className="t-mono audit__time">{formatDateTime(r.at)}</span>
                    <span className="audit__actor">
                      {r.actorName}
                      <span className="adm__sub"> · {r.actingAs ? ACTING[r.actingAs] : '—'}</span>
                    </span>
                    <span className="adm__sub">{r.positionName}</span>
                    <span className="audit__action">{label(r.action)}</span>
                    <span className="t-mono adm__sub">
                      {r.entityType} · {r.entityId}
                    </span>
                    <ChevronDown aria-hidden className={isOpen ? 'is-open' : undefined} />
                  </button>
                  {isOpen && (
                    <div className="audit__diff">
                      <div>
                        <p className="t-eyebrow">Sebelum</p>
                        <pre>{r.before === null ? '—' : JSON.stringify(r.before, null, 2)}</pre>
                      </div>
                      <div>
                        <p className="t-eyebrow">Sesudah</p>
                        <pre>{r.after === null ? '—' : JSON.stringify(r.after, null, 2)}</pre>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.length > PAGE && (
            <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
          )}
        </>
      )}
      <ConfirmDialog
        open={ask}
        title="Tampilkan nilai asli?"
        confirmLabel="Tampilkan dan Catat"
        onCancel={() => setAsk(false)}
        onConfirm={async () => {
          setAsk(false);
          try {
            await insightsApi.logShowOriginal();
            setOriginal(true);
          } catch (e) {
            toast.error('Gagal', (e as Error).message);
          }
        }}
      >
        Skor, predikat, catatan penilaian yang belum dibuka, dan nama berkas konfidensial akan
        tampil tanpa penyamaran. Penggunaan ini tercatat di jejak audit.
      </ConfirmDialog>
    </div>
  );
}
