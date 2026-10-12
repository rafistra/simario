import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  DatePickerField,
  InlineAlert,
  PageHeader,
  PredicateBadge,
  Select,
  StatusChip,
  Textarea,
  toast,
  type StatusKind,
} from '@/components';
import { ApiError, masterApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { validateBands, type BandProblem } from '@/domain/scoreBands';
import { PREDICATE_LABEL, type ScoreBand, type ScoreBandVersion } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate, formatScore, parseScore } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import './Master.css';

const STATUS: Record<ScoreBandVersion['status'], { chip: StatusKind; label: string }> = {
  active: { chip: 'terbit', label: 'aktif' },
  draft: { chip: 'draf', label: 'draf' },
  scheduled: { chip: 'menunggu', label: 'terjadwal' },
  retired: { chip: 'diarsipkan', label: 'tidak berlaku' },
};

const bandSummary = (bands: ScoreBand[]) =>
  [...bands]
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const lo =
        b.lowerExclusive === null
          ? '0'
          : formatScore(Math.round((b.lowerExclusive + 0.1) * 10) / 10);
      return `${lo}–${formatScore(b.upperInclusive)} ${PREDICATE_LABEL[b.predicate].split(' ')[0]!.charAt(0)}`;
    })
    .join(' · ');

function problemMessage(p: BandProblem, bands: ScoreBand[]): string {
  if (p.kind === 'gap') {
    const next = bands.find((b) => b.lowerExclusive === p.to);
    return `Ada celah antara ${formatScore(p.from)} dan ${formatScore(p.to)}: skor di rentang itu tidak memiliki predikat.${
      next
        ? ` Ubah batas bawah ${PREDICATE_LABEL[next.predicate]} menjadi ${formatScore(p.from)}.`
        : ''
    }`;
  }
  if (p.kind === 'overlap') {
    const a = bands.find((b) => b.upperInclusive === p.to);
    const b = bands.find((x) => x.lowerExclusive === p.from);
    return `Rentang ${a ? PREDICATE_LABEL[a.predicate] : ''} dan ${b ? PREDICATE_LABEL[b.predicate] : ''} tumpang tindih antara ${formatScore(p.from)} dan ${formatScore(p.to)}.`;
  }
  return 'Rentang harus berakhir tepat pada 4,0.';
}

/** 0–4 bar previewing the bands in colour with text labels; gaps in red (frame Sskiw). */
function BandPreview({ bands, problems }: { bands: ScoreBand[]; problems: BandProblem[] }) {
  const segments = [
    ...bands.map((b) => ({
      from: b.lowerExclusive ?? 0,
      to: b.upperInclusive,
      kind: b.predicate as string,
      label: PREDICATE_LABEL[b.predicate],
    })),
    ...problems
      .filter((p) => p.kind === 'gap')
      .map((p) => ({ from: p.from, to: p.to, kind: 'gap', label: '!' })),
  ].sort((a, b) => a.from - b.from);
  return (
    <div className="band-preview" aria-label="Pratinjau rentang 0,0 sampai 4,0">
      <p className="t-eyebrow">Pratinjau 0,0 – 4,0</p>
      <div className="band-preview__bar">
        {segments.map((s, i) => (
          <span
            key={i}
            className={`band-preview__seg band-preview__seg--${s.kind}`}
            style={{ flexGrow: Math.max(s.to - s.from, 0.05) }}
            title={s.label}
          >
            <span className="band-preview__label">
              {s.to - s.from >= 0.6 ? s.label : s.kind === 'gap' ? '!' : ''}
            </span>
          </span>
        ))}
      </div>
      <div className="band-preview__ticks t-mono">
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n}>{formatScore(n)}</span>
        ))}
      </div>
      {problems.some((p) => p.kind === 'gap') && (
        <p className="band-preview__gap">
          {problems
            .filter((p) => p.kind === 'gap')
            .map((p) => `Celah ${formatScore(p.from)}–${formatScore(p.to)}`)
            .join(' · ')}{' '}
          (merah)
        </p>
      )}
    </div>
  );
}

/** /master/skala-penilaian — FR-MST-007, INV-3. */
export default function ScoreBandsPage() {
  usePageMeta(['Master Data', 'Skala Penilaian']);
  const auth = useAuth();
  const db = useDb((s) => s.db);
  const versions = [...db.scoreBandVersions].sort((a, b) => b.number - a.number);
  const editable = versions.find((v) => v.status === 'draft');
  const [selectedId, setSelectedId] = useState(
    editable?.id ?? versions.find((v) => v.status === 'active')!.id,
  );
  const version = versions.find((v) => v.id === selectedId) ?? versions[0]!;
  const isDraft = version.status === 'draft';
  const stored = useMemo(
    () => db.scoreBands.filter((b) => b.versionId === version.id).sort((a, b) => a.order - b.order),
    [db.scoreBands, version.id],
  );
  const [bands, setBands] = useState(stored);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(version.effectiveFrom);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [newDate, setNewDate] = useState<string | null>(null);

  useEffect(() => {
    setBands(stored);
    setInputs({});
    setEffectiveFrom(version.effectiveFrom);
  }, [stored, version.effectiveFrom]);

  const problems = validateBands(bands);
  const usedBy = db.quarters.filter((q) => q.scoreBandVersionId === version.id);

  const setBound = (order: number, field: 'lowerExclusive' | 'upperInclusive', raw: string) => {
    setInputs((s) => ({ ...s, [`${order}-${field}`]: raw }));
    const value = parseScore(raw);
    if (value === null) return;
    setBands((bs) => bs.map((b) => (b.order === order ? { ...b, [field]: value } : b)));
  };

  const persistDraft = (next: ScoreBand[], date = effectiveFrom) =>
    masterApi.updateBandDraft(version.id, next, date);

  const save = async () => {
    setSaving(true);
    try {
      await masterApi.saveBandVersion(version.id, { effectiveFrom, bands });
      toast.success(
        `Versi ${version.number} disimpan`,
        `Berlaku mulai ${formatDate(effectiveFrom)} untuk triwulan yang dibuka sejak tanggal itu.`,
      );
    } catch (e) {
      if (!(e instanceof ApiError && e.code === 'bands_invalid'))
        toast.error('Versi tidak dapat disimpan', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createDraft = async () => {
    try {
      const id = await masterApi.createBandDraft(newDate!);
      setSelectedId(id);
      setNewDate(null);
    } catch (e) {
      toast.error('Draf tidak dapat dibuat', (e as Error).message);
    }
  };

  return (
    <div className="master-page master-page--narrow">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Skala Penilaian"
        subtitle="Rentang skor 0,0–4,0 menjadi predikat. Berversi; tepat satu versi aktif."
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              if (editable) {
                setSelectedId(editable.id);
                toast.error(
                  'Sudah ada draf versi',
                  `Lanjutkan atau buang Draf Versi ${editable.number} terlebih dahulu.`,
                );
              } else setNewDate(auth.today);
            }}
          >
            Buat Versi Baru
          </Button>
        }
      />

      <div className="band-toolbar">
        <Select
          label="Versi"
          value={version.id}
          onChange={(e) => setSelectedId(e.target.value)}
          options={versions.map((v) => ({
            value: v.id,
            label: `Versi ${v.number} · ${STATUS[v.status].label} · berlaku ${formatDate(v.effectiveFrom)}`,
          }))}
        />
        <DatePickerField
          label="Berlaku mulai"
          value={effectiveFrom}
          min={auth.today}
          disabled={!isDraft}
          error={
            isDraft && effectiveFrom < auth.today
              ? 'Tanggal berlaku tidak boleh sebelum hari ini.'
              : undefined
          }
          onChange={(e) => {
            setEffectiveFrom(e.target.value);
            if (isDraft) void persistDraft(bands, e.target.value);
          }}
        />
      </div>

      <div className="band-versions">
        {versions.map((v) => (
          <StatusChip
            key={v.id}
            status={STATUS[v.status].chip}
            label={`Versi ${v.number} · ${STATUS[v.status].label}${
              v.status === 'active'
                ? ` sejak ${formatDate(v.effectiveFrom)} · ${bandSummary(db.scoreBands.filter((b) => b.versionId === v.id))}`
                : ''
            }`}
          />
        ))}
      </div>

      <InlineAlert
        variant="info"
        title="Perubahan rentang tidak mengubah predikat yang sudah tersimpan."
      >
        Versi baru berlaku mulai triwulan pertama yang jendela penilaiannya dibuka pada atau setelah
        tanggal berlaku; triwulan yang sudah dibuka tetap memakai versinya.
        {usedBy.length > 0 && ` Versi ini dipakai ${usedBy.length} triwulan.`}
      </InlineAlert>

      {isDraft && problems.length > 0 && (
        <InlineAlert variant="error" title="Rentang tidak dapat disimpan">
          {problems.map((p) => problemMessage(p, bands)).join(' ')}
        </InlineAlert>
      )}

      <Card className="band-card">
        <div className="band-table" role="table" aria-label="Rentang predikat">
          <div role="row" className="band-table__head">
            <span role="columnheader">Predikat</span>
            <span role="columnheader">Batas bawah (eksklusif)</span>
            <span role="columnheader">Batas atas (inklusif)</span>
          </div>
          {bands.map((b, i) => {
            const prev = bands[i - 1];
            const lowerBad = prev && b.lowerExclusive !== prev.upperInclusive;
            return (
              <div
                role="row"
                key={b.order}
                className={['band-table__row', lowerBad && isDraft && 'is-invalid']
                  .filter(Boolean)
                  .join(' ')}
              >
                <span role="cell">
                  <PredicateBadge predicate={b.predicate} />
                </span>
                <span role="cell">
                  {b.lowerExclusive === null ? (
                    <span className="band-table__fixed t-mono">0,0 (termasuk 0)</span>
                  ) : (
                    <input
                      className="control band-table__input t-mono"
                      aria-label={`Batas bawah ${PREDICATE_LABEL[b.predicate]}`}
                      aria-invalid={lowerBad || undefined}
                      disabled={!isDraft}
                      value={inputs[`${b.order}-lowerExclusive`] ?? formatScore(b.lowerExclusive)}
                      onChange={(e) => setBound(b.order, 'lowerExclusive', e.target.value)}
                      onBlur={() => isDraft && void persistDraft(bands)}
                    />
                  )}
                  {lowerBad && isDraft && prev && (
                    <span className="field__error">
                      Harus {formatScore(prev.upperInclusive)} (sama dengan batas atas{' '}
                      {PREDICATE_LABEL[prev.predicate].split(' ')[0]}).
                    </span>
                  )}
                </span>
                <span role="cell">
                  <input
                    className="control band-table__input t-mono"
                    aria-label={`Batas atas ${PREDICATE_LABEL[b.predicate]}`}
                    disabled={!isDraft || i === bands.length - 1}
                    value={inputs[`${b.order}-upperInclusive`] ?? formatScore(b.upperInclusive)}
                    onChange={(e) => setBound(b.order, 'upperInclusive', e.target.value)}
                    onBlur={() => isDraft && void persistDraft(bands)}
                  />
                </span>
              </div>
            );
          })}
        </div>
        <BandPreview bands={bands} problems={isDraft ? problems : []} />
      </Card>

      <Card title="Panduan skoring per predikat (tampil sebagai bantuan di halaman penilaian)">
        <div className="band-guidance">
          {bands.map((b) => (
            <Textarea
              key={b.order}
              label={`Panduan · ${PREDICATE_LABEL[b.predicate]}`}
              rows={2}
              disabled={version.status === 'retired' || version.status === 'scheduled'}
              value={b.guidance}
              onChange={(e) =>
                setBands((bs) =>
                  bs.map((x) => (x.order === b.order ? { ...x, guidance: e.target.value } : x)),
                )
              }
              onBlur={(e) => {
                if (isDraft) void persistDraft(bands);
                else if (
                  version.status === 'active' &&
                  e.target.value !== stored.find((x) => x.order === b.order)?.guidance
                )
                  masterApi
                    .updateActiveGuidance(b.predicate, e.target.value)
                    .then(() => toast.success('Panduan disimpan'));
              }}
            />
          ))}
        </div>
      </Card>

      {isDraft && (
        <div className="master-actions">
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDiscard(true)}>
            Buang Draf
          </Button>
          <Button icon={Save} loading={saving} onClick={save}>
            Simpan Versi {version.number}
          </Button>
        </div>
      )}
      {version.status === 'scheduled' && (
        <div className="master-actions">
          <Button variant="ghost" icon={Trash2} onClick={() => setConfirmDiscard(true)}>
            Batalkan Versi {version.number}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        destructive
        title={`Buang Versi ${version.number}?`}
        confirmLabel="Buang Versi"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          await masterApi.discardBandDraft(version.id);
          setConfirmDiscard(false);
          setSelectedId(versions.find((v) => v.status === 'active')!.id);
          toast.success(`Versi ${version.number} dibuang`);
        }}
      >
        Rentang dan panduan pada versi ini akan dihapus. Versi aktif tidak berubah.
      </ConfirmDialog>
      <ConfirmDialog
        open={newDate !== null}
        title="Buat versi baru?"
        confirmLabel="Buat Draf"
        onCancel={() => setNewDate(null)}
        onConfirm={createDraft}
      >
        <p>Draf menyalin rentang dan panduan versi aktif. Atur tanggal berlaku, lalu simpan.</p>
        <DatePickerField
          label="Berlaku mulai"
          value={newDate ?? ''}
          min={auth.today}
          onChange={(e) => setNewDate(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
