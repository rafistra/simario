import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, Select, Textarea, TextInput } from '@/components';
import type { DB } from '@/data/db';
import { finalisingOfficial } from '@/domain/rules/access';
import { dataUmumAnchor } from '@/domain/rules/register';
import type { DataUmumField, DataUmumValues, Position, Register } from '@/domain/types';
import { formatDate, formatRupiah } from '@/lib/format';

interface Props {
  db: DB;
  position: Position;
  fiscalYear: number;
  register: Register | undefined;
  editing: boolean;
  today: string;
  /** Fields with a publish gap (highlighted). */
  gapFields: Set<string>;
  onSave: (patch: Partial<DataUmumValues>) => void;
}

const EMPTY: DataUmumValues = {
  tujuan: '',
  kegiatan: [],
  besarAnggaran: null,
  target: '',
  extra: {},
};

/** DataUmumCard (.pen ZO4ho) when drafting; DataUmumSummary (.pen xfIBX) otherwise. FR-REG-001. */
export function DataUmumSection({
  db,
  position,
  fiscalYear,
  register,
  editing,
  today,
  gapFields,
  onSave,
}: Props) {
  const type = db.positionTypes.find((t) => t.id === position.positionTypeId)!;
  const form =
    db.dataUmumForms.find((f) => f.id === register?.dataUmumFormId) ??
    db.dataUmumForms.find((f) => f.positionTypeId === position.positionTypeId && f.active);
  const saved = register?.dataUmum ?? { ...EMPTY, tujuan: form?.defaultObjective ?? '' };
  const [values, setValues] = useState<DataUmumValues>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setValues(JSON.parse(savedKey) as DataUmumValues), [savedKey]);

  const official = finalisingOfficial(db, position.id, today);
  const identity = (
    <aside className="du-identity" aria-label="Identitas dari data jabatan">
      <p className="t-eyebrow">Identitas · dari data jabatan</p>
      <dl>
        <div>
          <dt>Nama</dt>
          <dd>{official?.fullName ?? '—'}</dd>
        </div>
        {type.identitySchema.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd className={f.kind === 'date' || f.key.includes('nomor') ? 't-mono' : undefined}>
              {position.identity[f.key]
                ? f.kind === 'date'
                  ? formatDate(position.identity[f.key]!)
                  : position.identity[f.key]
                : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );

  const header = {
    eyebrow: 'Data Umum',
    title: `Data Umum Register TA ${fiscalYear}`,
    aside: form ? (
      <span className="t-mono du-form-version">
        Formulir {type.code} v{form.version}
      </span>
    ) : undefined,
  };

  if (!editing) {
    const rows: [string, React.ReactNode][] = [
      ['Tujuan', saved.tujuan || '—'],
      [
        'Kegiatan',
        saved.kegiatan.filter(Boolean).length ? (
          <ol className="du-list">
            {saved.kegiatan.filter(Boolean).map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ol>
        ) : (
          '—'
        ),
      ],
      [
        'Besar Anggaran',
        saved.besarAnggaran !== null ? (
          <span className="t-mono">{formatRupiah(saved.besarAnggaran)}</span>
        ) : (
          '—'
        ),
      ],
      ...(form?.fields ?? []).map<[string, React.ReactNode]>((f) => [
        f.label,
        saved.extra[f.key] || '—',
      ]),
      ['Target', saved.target || '—'],
    ];
    return (
      <Card {...header} className="du-card">
        <div className="du-grid">
          <dl className="du-summary">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {identity}
        </div>
      </Card>
    );
  }

  const commit = (patch: Partial<DataUmumValues>) => {
    const next = { ...values, ...patch };
    setValues(next);
    const changed = Object.entries(patch).some(
      ([k, v]) => JSON.stringify(v) !== JSON.stringify(saved[k as keyof DataUmumValues]),
    );
    if (changed) onSave(patch);
  };
  const err = (field: string, label: string) =>
    gapFields.has(field) ? `${label} wajib diisi sebelum register diterbitkan.` : undefined;

  return (
    <Card {...header} className="du-card">
      <div className="du-grid">
        <div className="du-fields">
          <div id={dataUmumAnchor('tujuan')}>
            <Textarea
              label="Tujuan"
              required
              rows={3}
              value={values.tujuan}
              error={err('tujuan', 'Tujuan')}
              onChange={(e) => setValues({ ...values, tujuan: e.target.value })}
              onBlur={() => commit({ tujuan: values.tujuan })}
            />
          </div>
          <fieldset id={dataUmumAnchor('kegiatan')} className="du-kegiatan">
            <legend className="field__label">
              Kegiatan{' '}
              <span className="field__required" aria-hidden>
                *
              </span>
            </legend>
            {(values.kegiatan.length ? values.kegiatan : ['']).map((k, i) => (
              <div key={i} className="du-kegiatan__row">
                <label className="sr-only" htmlFor={`keg-${i}`}>
                  Kegiatan {i + 1}
                </label>
                <input
                  id={`keg-${i}`}
                  className="control"
                  value={k}
                  aria-invalid={gapFields.has('kegiatan') || undefined}
                  onChange={(e) => {
                    const list = values.kegiatan.length ? [...values.kegiatan] : [''];
                    list[i] = e.target.value;
                    setValues({ ...values, kegiatan: list });
                  }}
                  onBlur={() => commit({ kegiatan: values.kegiatan })}
                />
                {values.kegiatan.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Hapus kegiatan ${i + 1}`}
                    onClick={() => commit({ kegiatan: values.kegiatan.filter((_, j) => j !== i) })}
                  >
                    <X aria-hidden />
                  </button>
                )}
              </div>
            ))}
            {gapFields.has('kegiatan') && (
              <p className="field__error">Kegiatan wajib diisi sebelum register diterbitkan.</p>
            )}
            <button
              type="button"
              className="link-add"
              onClick={() =>
                setValues({
                  ...values,
                  kegiatan: [...(values.kegiatan.length ? values.kegiatan : ['']), ''],
                })
              }
            >
              <Plus aria-hidden /> Tambah kegiatan
            </button>
          </fieldset>
          <div className="du-row">
            <div id={dataUmumAnchor('besarAnggaran')}>
              <TextInput
                label="Besar Anggaran (Rp)"
                required
                inputMode="numeric"
                className="t-mono-input"
                value={
                  values.besarAnggaran === null
                    ? ''
                    : new Intl.NumberFormat('id-ID').format(values.besarAnggaran)
                }
                error={err('besarAnggaran', 'Besar Anggaran')}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setValues({ ...values, besarAnggaran: digits ? Number(digits) : null });
                }}
                onBlur={() => commit({ besarAnggaran: values.besarAnggaran })}
              />
            </div>
            {(form?.fields ?? []).map((f) => (
              <div key={f.key} id={dataUmumAnchor(f.key)}>
                <ExtraField
                  field={f}
                  value={values.extra[f.key] ?? ''}
                  error={err(f.key, f.label)}
                  onChange={(v) => setValues({ ...values, extra: { ...values.extra, [f.key]: v } })}
                  onCommit={(v) => commit({ extra: { ...values.extra, [f.key]: v } })}
                />
              </div>
            ))}
          </div>
          <div id={dataUmumAnchor('target')}>
            <Textarea
              label="Target"
              required
              rows={2}
              value={values.target}
              error={err('target', 'Target')}
              onChange={(e) => setValues({ ...values, target: e.target.value })}
              onBlur={() => commit({ target: values.target })}
            />
          </div>
        </div>
        {identity}
      </div>
    </Card>
  );
}

function ExtraField({
  field,
  value,
  error,
  onChange,
  onCommit,
}: {
  field: DataUmumField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  if (field.kind === 'list' && field.options?.length)
    return (
      <Select
        label={field.label}
        required={field.mandatory}
        value={value}
        error={error}
        placeholder="Pilih"
        options={field.options.map((o) => ({ value: o, label: o }))}
        onChange={(e) => {
          onChange(e.target.value);
          onCommit(e.target.value);
        }}
      />
    );
  return (
    <TextInput
      label={field.label}
      required={field.mandatory}
      type={field.kind === 'date' ? 'date' : 'text'}
      inputMode={field.kind === 'number' || field.kind === 'currency' ? 'numeric' : undefined}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => onCommit(e.target.value)}
    />
  );
}
