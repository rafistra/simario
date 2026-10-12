import { ArrowDown, ArrowUp, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  InlineAlert,
  PageHeader,
  StatusChip,
  Textarea,
  Toggle,
  toast,
} from '@/components';
import { ApiError, masterApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import type { DataUmumField } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import './Master.css';

const FIXED = [
  { label: 'Kegiatan', kind: 'Daftar' },
  { label: 'Besar Anggaran', kind: 'Mata uang (Rp)' },
  { label: 'Target', kind: 'Teks panjang' },
];

const KINDS: { value: DataUmumField['kind']; label: string }[] = [
  { value: 'text', label: 'Teks' },
  { value: 'number', label: 'Angka' },
  { value: 'currency', label: 'Mata uang (Rp)' },
  { value: 'date', label: 'Tanggal' },
  { value: 'list', label: 'Daftar' },
];

/** /master/data-umum — FR-MST-006. */
export default function DataUmumPage() {
  usePageMeta(['Master Data', 'Data Umum']);
  const auth = useAuth();
  const db = useDb((s) => s.db);
  const types = db.positionTypes.filter((t) => t.line === 1 && t.hasTemplates);
  const [typeId, setTypeId] = useState('pt-ppk');
  const [pendingType, setPendingType] = useState<string | null>(null);
  const form = db.dataUmumForms.find((f) => f.positionTypeId === typeId && f.active)!;
  const [objective, setObjective] = useState(form.defaultObjective);
  const [objectiveOn, setObjectiveOn] = useState(form.objectiveEnabled);
  const [fields, setFields] = useState<DataUmumField[]>(form.fields);
  const [optionText, setOptionText] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObjective(form.defaultObjective);
    setObjectiveOn(form.objectiveEnabled);
    setFields(form.fields);
    setOptionText(Object.fromEntries(form.fields.map((f, i) => [i, (f.options ?? []).join(', ')])));
    setErrors({});
  }, [form]);

  const dirty = useMemo(
    () =>
      objective !== form.defaultObjective ||
      objectiveOn !== form.objectiveEnabled ||
      JSON.stringify(fields) !== JSON.stringify(form.fields),
    [objective, objectiveOn, fields, form],
  );

  // Warn before leaving with unsaved changes (StateContract).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const update = (i: number, patch: Partial<DataUmumField>) =>
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, j: number) => {
    if (j < 0 || j >= fields.length) return;
    setFields((fs) => {
      const next = [...fs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setOptionText((o) => ({ ...o, [i]: o[j] ?? '', [j]: o[i] ?? '' }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const version = await masterApi.saveDataUmumForm(typeId, objective, fields, objectiveOn);
      setErrors({});
      toast.success(
        `Formulir disimpan sebagai Versi ${version}`,
        'Register yang sudah dimulai tetap memakai versi awalnya.',
      );
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(e.details as Record<number, string>);
      else toast.error('Formulir tidak dapat disimpan', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const typeName = types.find((t) => t.id === typeId)!.name;

  return (
    <div className="master-page">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Formulir Data Umum"
        subtitle="Satu formulir berversi per jenis pemilik risiko Lini 1. Blok identitas tidak diatur di sini; diambil dari jabatan dan holding Pejabat."
      />
      <div className="du-layout">
        <nav className="du-types" aria-label="Jenis pemilik risiko">
          {types.map((t) => {
            const f = db.dataUmumForms.find((x) => x.positionTypeId === t.id && x.active)!;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={t.id === typeId ? 'true' : undefined}
                className={['du-type', t.id === typeId && 'is-current'].filter(Boolean).join(' ')}
                onClick={() => (dirty && t.id !== typeId ? setPendingType(t.id) : setTypeId(t.id))}
              >
                <span className="du-type__name">{t.name}</span>
                <span className="t-caption">Versi {f.version}</span>
              </button>
            );
          })}
        </nav>

        <Card
          eyebrow={`Formulir Data Umum · ${typeName}`}
          title={`Versi ${form.version} · berlaku sejak ${formatDate(form.createdAt ?? auth.today)}`}
          aside={
            dirty ? <StatusChip status="siap" label="Ada perubahan belum disimpan" /> : undefined
          }
          className="du-card"
        >
          <p className="t-eyebrow du-section">Isian tetap · selalu ada</p>
          <ul className="du-fixed">
            {FIXED.map((f) => (
              <li key={f.label}>
                <Lock aria-hidden />
                <span className="du-fixed__label">{f.label}</span>
                <span className="t-caption">{f.kind}</span>
                <span className="du-req">Wajib</span>
              </li>
            ))}
          </ul>

          <p className="t-eyebrow du-section">Isian opsional</p>
          <ul className="du-fixed du-optional">
            <li>
              <span className="du-fixed__label">Tujuan</span>
              <span className="t-caption">Teks panjang · tidak wajib</span>
              <Toggle label="Aktif" checked={objectiveOn} onChange={setObjectiveOn} />
            </li>
          </ul>
          {objectiveOn ? (
            <Textarea
              label="Teks bawaan Tujuan (dapat diubah pengguna)"
              rows={2}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          ) : (
            <p className="t-caption">Tujuan tidak ditampilkan di register dan lembar.</p>
          )}

          <p className="t-eyebrow du-section">Isian tambahan</p>
          {fields.length === 0 && (
            <p className="t-caption">Belum ada isian tambahan untuk jenis ini.</p>
          )}
          <ol className="du-fields">
            {fields.map((f, i) => (
              <li key={i} className="du-field">
                <span className="du-field__order t-mono">{i + 1}</span>
                <div className="du-field__main">
                  <div className="du-field__row">
                    <label className="field du-field__label">
                      <span className="sr-only">Label isian {i + 1}</span>
                      <input
                        className="control"
                        placeholder="Label isian"
                        aria-invalid={errors[i] ? true : undefined}
                        value={f.label}
                        onChange={(e) => update(i, { label: e.target.value })}
                      />
                    </label>
                    <label className="field du-field__kind">
                      <span className="sr-only">Jenis isian {i + 1}</span>
                      <select
                        className="control control--select"
                        value={f.kind}
                        onChange={(e) =>
                          update(i, { kind: e.target.value as DataUmumField['kind'] })
                        }
                      >
                        {KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Toggle
                      label="Wajib"
                      checked={f.mandatory}
                      onChange={(v) => update(i, { mandatory: v })}
                    />
                  </div>
                  {f.kind === 'list' && (
                    <label className="field">
                      <span className="field__helper">Pilihan, dipisahkan koma</span>
                      <input
                        className="control"
                        placeholder="Rupiah Murni, PNBP, PHLN, SBSN"
                        value={optionText[i] ?? ''}
                        onChange={(e) => {
                          setOptionText((o) => ({ ...o, [i]: e.target.value }));
                          update(i, {
                            options: e.target.value
                              .split(',')
                              .map((x) => x.trim())
                              .filter(Boolean),
                          });
                        }}
                      />
                    </label>
                  )}
                  {errors[i] && <span className="field__error">{errors[i]}</span>}
                </div>
                <span className="du-field__tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Naikkan"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Turunkan"
                    disabled={i === fields.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Hapus isian ${f.label || i + 1}`}
                    onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <div>
            <Button
              variant="ghost"
              icon={Plus}
              onClick={() =>
                setFields((fs) => [...fs, { key: '', label: '', kind: 'text', mandatory: false }])
              }
            >
              Tambah Isian
            </Button>
          </div>
          <InlineAlert variant="info" title={`Menyimpan membuat Versi ${form.version + 1}.`}>
            Register yang sudah dimulai tetap memakai versi awalnya. Isian wajib yang kosong
            memblokir penerbitan register.
          </InlineAlert>
          <div className="master-actions">
            <Button icon={Save} loading={saving} onClick={save}>
              Simpan sebagai Versi {form.version + 1}
            </Button>
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={pendingType !== null}
        title="Tinggalkan perubahan yang belum disimpan?"
        confirmLabel="Tinggalkan"
        destructive
        onCancel={() => setPendingType(null)}
        onConfirm={() => {
          setTypeId(pendingType!);
          setPendingType(null);
        }}
      >
        Perubahan pada formulir {typeName} akan hilang.
      </ConfirmDialog>
    </div>
  );
}
