import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  DataTable,
  FileDrop,
  FilterPills,
  InlineAlert,
  PageHeader,
  SummaryStrip,
  toast,
  type Column,
} from '@/components';
import { IMPORT_LABEL } from '@/data/derive/importer';
import type { DryRun, ImportError, ImportJob, ImportKind } from '@/test/fake/api/importer';
import { importApi } from '@/data/repository';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { useAuth } from '@/state/useAuth';
import './Admin.css';

/** UTF-8 byte-order mark so spreadsheet apps read the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** /pengaturan/impor — FR-ADM-013. */
export default function ImportPage() {
  usePageMeta(['Pengaturan', 'Impor Data']);
  const auth = useAuth();
  const kinds = importApi.kindsFor(auth.user.id, auth.today);
  const [kind, setKind] = useState<ImportKind>(kinds[0] ?? 'jabatan');
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [dry, setDry] = useState<DryRun | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useQuery(() => importApi.history(), []);

  const download = () => {
    const blob = new Blob([BOM + `${importApi.template(kind)}\n`], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `templat-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    try {
      setDry(await importApi.dryRun(kind, t));
    } catch (e) {
      toast.error('Uji coba gagal', (e as Error).message);
    }
  };

  const badRows = dry ? new Set(dry.errors.map((e) => e.row)).size : 0;
  const columns: Column<ImportError>[] = [
    {
      key: 'r',
      header: 'Baris',
      width: 80,
      render: (e) => <span className="t-mono">{e.row}</span>,
    },
    {
      key: 'c',
      header: 'Kolom',
      width: 200,
      render: (e) => <span className="t-mono">{e.column}</span>,
    },
    { key: 'm', header: 'Pesan', primary: true, render: (e) => e.message },
  ];
  const jobs: Column<ImportJob>[] = [
    {
      key: 'a',
      header: 'Waktu',
      width: 170,
      render: (j) => <span className="t-mono">{formatDateTime(j.at)}</span>,
    },
    { key: 'k', header: 'Jenis', primary: true, render: (j) => IMPORT_LABEL[j.kind] },
    {
      key: 'r',
      header: 'Baris',
      width: 90,
      align: 'right',
      render: (j) => <span className="t-mono">{j.rows}</span>,
    },
    { key: 'p', header: 'Oleh', render: (j) => j.actor },
  ];

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengaturan"
        title="Impor Data"
        subtitle="Unggah CSV → uji coba → Terapkan. Tidak ada yang ditulis selama masih ada galat."
      />
      <FilterPills
        label="Jenis impor"
        items={kinds.map((k) => ({ value: k, label: IMPORT_LABEL[k] }))}
        selected={[kind]}
        onToggle={(v) => {
          setKind(v as ImportKind);
          setDry(null);
          setText(null);
        }}
      />
      <div className="adm__actions">
        <Button variant="secondary" icon={Download} onClick={download}>
          Unduh Templat CSV
        </Button>
      </div>
      <FileDrop
        accept=".csv,text/csv"
        title={fileName ? `Berkas: ${fileName}` : 'Seret berkas CSV ke sini'}
        caption="Mengunggah ulang mengganti hasil uji coba."
        onFiles={(f) => void load(f)}
      />
      {dry && (
        <>
          <SummaryStrip
            items={[
              { figure: dry.rows, label: 'Baris' },
              { figure: dry.valid, label: 'Valid', dot: 'var(--status-terbit-dot)' },
              { figure: dry.errors.length, label: 'Galat', dot: 'var(--danger-500)' },
            ]}
          />
          {dry.errors.length > 0 && (
            <DataTable
              caption="Galat uji coba"
              columns={columns}
              rows={dry.errors}
              rowKey={(e) => `${e.row}-${e.column}-${e.message}`}
            />
          )}
          <div className="adm__actions">
            <Button
              icon={Upload}
              loading={busy}
              onClick={async () => {
                if (badRows) {
                  toast.error(`Perbaiki ${badRows} baris bermasalah terlebih dahulu`);
                  return;
                }
                setBusy(true);
                try {
                  const n = await importApi.apply(kind, text!);
                  toast.success(`${n} baris diterapkan`);
                  setDry(null);
                  setText(null);
                  setFileName('');
                } catch (e) {
                  toast.error('Impor gagal', (e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Terapkan
            </Button>
            {badRows > 0 && (
              <span className="adm__warn">Perbaiki {badRows} baris bermasalah terlebih dahulu</span>
            )}
          </div>
        </>
      )}
      <h2 className="adm__h2">Riwayat impor</h2>
      {history.data && history.data.length === 0 ? (
        <InlineAlert variant="info" title="Belum ada impor." />
      ) : (
        <DataTable
          caption="Riwayat impor"
          columns={jobs}
          rows={history.data ?? []}
          rowKey={(j) => j.at + j.kind}
        />
      )}
    </div>
  );
}
