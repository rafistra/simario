import { Check, History, Printer, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  InlineAlert,
  LoadingRegion,
  SlideOver,
  Skeleton,
  StatusChip,
  toast,
} from '@/components';
import type { SheetView } from '@/test/fake/api/sheets';
import { sheetApi, useSheetRevision } from '@/data/repository';
import { QUARTER_ROMAN } from '@/domain/calendar';
import type { SheetPayload, SheetSection } from '@/domain/rules/sheetPayload';
import type { PrintSnapshot } from '@/domain/types';
import type { WorkspaceOutletContext } from '@/layout/Workspace';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@/lib/useQuery';
import { now } from '@/state/clock';
import { KomunikasiDocument, MutuDocument, type DocMeta } from './SheetDocument';
import './Sheets.css';

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;
const TRIGGER: Record<PrintSnapshot['trigger'], string> = {
  print: 'Cetak',
  auto_freeze: 'Otomatis',
  archive: 'Arsip',
};

/** /jabatan/:jid/lembar/:ta/:tw — FR-LBR-001 … 010. */
export default function SheetPage() {
  const { position, unitCode, fiscalYear, quarter } = useOutletContext<WorkspaceOutletContext>();
  usePageMeta(['Lembar Komunikasi', `${position.name} · ${unitCode}`]);
  const [params] = useSearchParams();
  const snapshotId = params.get('salinan');
  const revision = useSheetRevision((s) => s.revision);
  const q = useQuery(
    () => sheetApi.view(position.id, fiscalYear, quarter, snapshotId),
    [position.id, fiscalYear, quarter, snapshotId],
    revision,
  );
  if (q.loading && !q.data)
    return (
      <LoadingRegion label="Memuat lembar…">
        <Skeleton height={600} radius="lg" />
      </LoadingRegion>
    );
  if (q.error && !q.data)
    return (
      <InlineAlert variant="error" title="Lembar gagal dimuat" onRetry={q.retry}>
        {q.error.message}
      </InlineAlert>
    );
  return <Sheet view={q.data!} positionId={position.id} />;
}

function Sheet({ view, positionId }: { view: SheetView; positionId: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind: PrintSnapshot['kind'] =
    view.snapshot?.kind ?? (params.get('lembar') === 'mutu' ? 'mutu' : 'komunikasi');
  const [versions, setVersions] = useState(false);
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [printAsk, setPrintAsk] = useState(false);
  const [printKinds, setPrintKinds] = useState<PrintSnapshot['kind'][]>(['komunikasi']);
  const [printing, setPrinting] = useState<
    { payload: SheetPayload; meta: DocMeta; kind: PrintSnapshot['kind'] }[] | null
  >(null);
  const [picker, setPicker] = useState<SheetSection | null>(null);
  const q = view.quarter;
  const base = `/jabatan/${positionId}/lembar/${q.fiscalYear}`;

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 50);
    return () => clearTimeout(t);
  }, [printing]);

  if (!view.published)
    return (
      <EmptyState
        title={`Register TA ${q.fiscalYear} belum diterbitkan.`}
        message="Lembar disusun dari utas dan penilaian setelah register diterbitkan."
      />
    );

  const meta = (snap = view.snapshot): DocMeta => ({
    snapshot: snap,
    latestVersion: view.latestVersion,
    printedAt: now(),
    masked: view.masked.length > 0,
    signatures: view.payload.signatures,
  });

  const doPrint = async () => {
    setPrintAsk(false);
    if (view.snapshot) {
      // FR-LBR-006: a frozen version prints as is — no new snapshot.
      setPrinting([
        { payload: view.payload, meta: { ...meta(), print: true }, kind: view.snapshot.kind },
      ]);
      return;
    }
    try {
      const ids = await sheetApi.print(positionId, q.fiscalYear, q.number, printKinds);
      // Each new snapshot is read back as the server serves it (masked per viewer, VIS-9).
      const copies = await Promise.all(
        ids.map((id) => sheetApi.view(positionId, q.fiscalYear, q.number, id)),
      );
      const docs = copies.map((c) => {
        const s = c.snapshot!;
        return {
          payload: c.payload,
          kind: s.kind,
          meta: {
            snapshot: s,
            latestVersion: s.version,
            printedAt: s.createdAt,
            masked: c.masked.length > 0,
            signatures: c.payload.signatures,
            print: true,
          },
        };
      });
      toast.success(
        `${ids.length} salinan cetak dibuat`,
        docs.map((d) => d.meta.snapshot!.number).join(', '),
      );
      setPrinting(docs);
    } catch (e) {
      toast.error('Cetak gagal', (e as Error).message);
    }
  };

  const find = async () => {
    setLookupError(null);
    try {
      const r = await sheetApi.findByNumber(lookup);
      setVersions(false);
      navigate(`/jabatan/${r.positionId}/lembar/${r.fiscalYear}/${r.tw}?salinan=${r.id}`);
    } catch (e) {
      setLookupError((e as Error).message);
    }
  };

  const doc =
    kind === 'mutu' ? (
      <MutuDocument payload={view.payload} meta={meta()} />
    ) : (
      <KomunikasiDocument
        payload={view.payload}
        meta={meta()}
        onPick={
          view.snapshot
            ? undefined
            : (s) =>
                view.canPick[s]
                  ? setPicker(s)
                  : toast.error(
                      'Tidak dapat memilih foto',
                      `Foto Bagian ${s} dipilih oleh peserta Lini ${s === 'A' ? 1 : s === 'B' ? 2 : 3}.`,
                    )
        }
      />
    );

  return (
    <div className="sheets">
      <div className="sheets__toolbar no-print">
        <nav className="hstrip__tabs" aria-label="Pilih triwulan">
          {view.quarters.map((x) => (
            <Link
              key={x.id}
              to={`${base}/${x.number}`}
              className={['hstrip__tab', x.id === q.id && 'is-active'].filter(Boolean).join(' ')}
              aria-current={x.id === q.id ? 'page' : undefined}
            >
              {tw(x.number)}
            </Link>
          ))}
        </nav>
        {!view.snapshot && (
          <div className="tabs sheets__tabs" role="tablist" aria-label="Jenis lembar">
            {(['komunikasi', 'mutu'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                className={['tab', kind === k && 'tab--active'].filter(Boolean).join(' ')}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  if (k === 'mutu') next.set('lembar', 'mutu');
                  else next.delete('lembar');
                  setParams(next, { replace: true });
                }}
              >
                {k === 'komunikasi' ? 'Lembar Komunikasi' : 'Lembar Mutu'}
              </button>
            ))}
          </div>
        )}
        <span className="sheets__spacer" />
        {view.snapshot ? (
          <StatusChip status="diarsipkan" label="Salinan beku" />
        ) : (
          <StatusChip status="terbuka" label="Tampilan berjalan" />
        )}
        <Button variant="secondary" icon={History} onClick={() => setVersions(true)}>
          Versi ({view.snapshots.length})
        </Button>
        <Button icon={Printer} onClick={() => (view.snapshot ? void doPrint() : setPrintAsk(true))}>
          Cetak
        </Button>
      </div>

      {view.snapshot && (
        <InlineAlert variant="info" title="Ini salinan beku." className="no-print">
          <Link
            className="text-link"
            to={`${base}/${q.number}${kind === 'mutu' ? '?lembar=mutu' : ''}`}
          >
            Lihat tampilan berjalan.
          </Link>{' '}
          {view.snapshot.number} ·{' '}
          {view.snapshot.isProvisional ? 'Sementara' : `Versi ${view.snapshot.version}`} ·{' '}
          {TRIGGER[view.snapshot.trigger]} {formatDateTime(view.snapshot.createdAt)}
          {view.snapshot.supersededByVersion && (
            <strong> · Digantikan oleh Versi {view.snapshot.supersededByVersion}</strong>
          )}
        </InlineAlert>
      )}
      {view.masked.length > 0 && (
        <InlineAlert
          variant="warning"
          title="Sebagian isi disamarkan untuk pembaca ini"
          className="no-print"
        >
          {view.masked.length} risiko tampil "Menunggu" karena hasil direktorat Anda untuk risiko
          itu belum dibuka.
        </InlineAlert>
      )}

      {doc}

      <ConfirmDialog
        open={printAsk}
        title="Cetak lembar"
        confirmLabel="Buat Salinan & Cetak"
        onConfirm={doPrint}
        onCancel={() => setPrintAsk(false)}
      >
        <p>
          Setiap cetakan dari tampilan berjalan membuat salinan beku bernomor; yang tercetak adalah
          salinan itu.
        </p>
        <div className="sheets__choices" role="radiogroup" aria-label="Pilihan cetak">
          {(
            [
              ['komunikasi', 'Lembar Komunikasi'],
              ['mutu', 'Lembar Mutu'],
              ['both', 'Keduanya'],
            ] as const
          ).map(([v, label]) => {
            const kinds: PrintSnapshot['kind'][] = v === 'both' ? ['komunikasi', 'mutu'] : [v];
            const on = kinds.join() === printKinds.join();
            return (
              <label key={v} className="sheets__choice">
                <input
                  type="radio"
                  name="print-kind"
                  checked={on}
                  onChange={() => setPrintKinds(kinds)}
                />{' '}
                {label}
              </label>
            );
          })}
        </div>
        {!view.latestVersion && (
          <p className="doc__muted">
            Belum ada versi otomatis triwulan ini: cetakan bertanda SEMENTARA.
          </p>
        )}
      </ConfirmDialog>

      <SlideOver
        open={versions}
        eyebrow={`${tw(q.number)} · TA ${q.fiscalYear}`}
        title="Versi & salinan cetak"
        onClose={() => setVersions(false)}
      >
        <div className="versions">
          <form
            className="versions__search"
            onSubmit={(e) => {
              e.preventDefault();
              void find();
            }}
          >
            <label className="field__label" htmlFor="snap-number">
              Cari nomor cetak
            </label>
            <div className="versions__row">
              <input
                id="snap-number"
                className="control t-mono"
                placeholder="SIMARIO/LK/2027/TW1/…"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
              />
              <Button type="submit" variant="secondary" icon={Search}>
                Cari
              </Button>
            </div>
            {lookupError && <p className="field__error">{lookupError}</p>}
          </form>
          <Link
            className={['versions__item', !view.snapshot && 'is-current'].filter(Boolean).join(' ')}
            to={`${base}/${q.number}`}
            onClick={() => setVersions(false)}
          >
            <span className="versions__num">Tampilan berjalan</span>
            <span className="doc__muted">Berubah mengikuti utas dan penilaian sampai arsip</span>
          </Link>
          {view.snapshots.length === 0 && (
            <p className="doc__muted">Belum ada salinan untuk triwulan ini.</p>
          )}
          {view.snapshots.map((s) => (
            <Link
              key={s.id}
              to={`${base}/${q.number}?salinan=${s.id}`}
              className={['versions__item', view.snapshot?.id === s.id && 'is-current']
                .filter(Boolean)
                .join(' ')}
              onClick={() => setVersions(false)}
            >
              <span className="versions__num t-mono">{s.number}</span>
              <span>
                {s.kind === 'komunikasi' ? 'Lembar Komunikasi' : 'Lembar Mutu'} ·{' '}
                {s.isProvisional ? 'Sementara' : `Versi ${s.version}`} · {TRIGGER[s.trigger]}
              </span>
              <span className="doc__muted">
                {s.createdBy} · {formatDateTime(s.createdAt)}
                {s.supersededByVersion ? ` · Digantikan oleh Versi ${s.supersededByVersion}` : ''}
              </span>
            </Link>
          ))}
        </div>
      </SlideOver>

      {picker && (
        <PhotoPicker
          view={view}
          section={picker}
          positionId={positionId}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Prototype check: ?salinan=…&cetak=pratinjau keeps the print layout mounted (PDF previews). */}
      {!printing &&
        view.snapshot &&
        params.get('cetak') === 'pratinjau' &&
        createPortal(
          <div className="print-root">
            {kind === 'mutu' ? (
              <MutuDocument payload={view.payload} meta={{ ...meta(), print: true }} />
            ) : (
              <KomunikasiDocument payload={view.payload} meta={{ ...meta(), print: true }} />
            )}
          </div>,
          document.body,
        )}
      {printing &&
        createPortal(
          <div className="print-root">
            {printing.map((d, i) =>
              d.kind === 'mutu' ? (
                <MutuDocument key={i} payload={d.payload} meta={d.meta} />
              ) : (
                <KomunikasiDocument key={i} payload={d.payload} meta={d.meta} />
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** FR-LBR-005: pick up to 5 images of a section; the sixth is refused. */
function PhotoPicker({
  view,
  section,
  positionId,
  onClose,
}: {
  view: SheetView;
  section: SheetSection;
  positionId: string;
  onClose: () => void;
}) {
  const all = view.payload.risks.flatMap((r) =>
    (section === 'A'
      ? [...r.steps, ...r.lini1Other]
      : section === 'B'
        ? r.lini2
        : r.lini3Comments
    ).flatMap((c) => c.images.map((i) => ({ ...i, by: c.author, at: c.at }))),
  );
  const [chosen, setChosen] = useState<string[]>(view.payload.photos[section].map((p) => p.id));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => {
    setError(null);
    if (chosen.includes(id)) setChosen(chosen.filter((x) => x !== id));
    else if (chosen.length >= 5) setError('Maksimal 5 foto per bagian');
    else setChosen([...chosen, id]);
  };
  return (
    <SlideOver
      open
      eyebrow={`Bagian ${section}`}
      title="Pilih foto untuk dicetak"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await sheetApi.setPhotos(positionId, view.quarter.id, section, chosen);
                toast.success('Pilihan foto disimpan');
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Simpan Pilihan
          </Button>
        </>
      }
    >
      {error && <InlineAlert variant="error" title={error} />}
      {all.length === 0 ? (
        <p className="doc__muted">Belum ada foto pada komentar bagian ini triwulan ini.</p>
      ) : (
        <ul className="picker">
          {all.map((img) => {
            const order = chosen.indexOf(img.id);
            return (
              <li key={img.id}>
                <button
                  type="button"
                  className={['picker__tile', order >= 0 && 'is-on'].filter(Boolean).join(' ')}
                  aria-pressed={order >= 0}
                  onClick={() => toggle(img.id)}
                >
                  <span className="picker__img" aria-hidden />
                  {order >= 0 && (
                    <span className="picker__badge">
                      <Check aria-hidden /> {order + 1}
                    </span>
                  )}
                  <span className="picker__name t-mono">{img.name}</span>
                  <span className="doc__muted">{img.by}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="doc__muted">
        {chosen.length} dari maks. 5 dipilih. Lampiran konfidensial tidak pernah ditawarkan.
      </p>
    </SlideOver>
  );
}
