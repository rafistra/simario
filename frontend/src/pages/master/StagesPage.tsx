import { ChevronDown, ChevronRight, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type DragEvent, type KeyboardEvent } from 'react';
import { Button, ConfirmDialog, LineChip, PageHeader, Toggle, toast } from '@/components';
import { masterApi } from '@/data/repository';
import { stageUsedByRegister } from '@/data/derive/master';
import { useGateDb } from '@/components/DataGate/gateDb';
import type { PositionType, Stage } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { useAuth } from '@/state/useAuth';
import './Master.css';

function InlineName({ stage, onDone }: { stage: Stage; onDone: () => void }) {
  const [value, setValue] = useState(stage.name);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await masterApi.renameStage(stage.id, value);
      toast.success('Nama tahap disimpan');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <span className="inline-edit">
      <input
        className="control"
        aria-label="Nama tahap"
        aria-invalid={error ? true : undefined}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') {
            e.stopPropagation();
            onDone();
          }
        }}
      />
      <span className={error ? 'field__error' : 'field__helper'}>
        {error ?? 'Enter menyimpan · Esc membatalkan'}
      </span>
    </span>
  );
}

function TypeSection({
  type,
  open,
  onToggle,
}: {
  type: PositionType;
  open: boolean;
  onToggle: () => void;
}) {
  const db = useGateDb();
  const all = db.stages.filter((s) => s.positionTypeId === type.id);
  const active = all.filter((s) => s.active).sort((a, b) => a.order - b.order);
  const inactive = all.filter((s) => !s.active);
  const templates = (stageId: string) =>
    db.riskTemplates.filter((t) => t.stageId === stageId).length;
  const totalTemplates = all.reduce((n, s) => n + templates(s.id), 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Stage | null>(null);

  const reorder = async (ids: string[]) => {
    await masterApi.reorderStages(type.id, ids);
    toast.success('Urutan tahap disimpan');
  };
  const move = (id: string, delta: number) => {
    const ids = active.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void reorder(ids);
  };
  const onDrop = (e: DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const ids = active.map((s) => s.id).filter((x) => x !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    setDragId(null);
    void reorder(ids);
  };
  const usedLabel = (s: Stage) => {
    const years = [
      ...new Set(
        db.registers
          .filter(
            (r) =>
              db.risks.some((x) => x.registerId === r.id && x.stageId === s.id) ||
              db.declarations.some((d) => d.registerId === r.id && d.stageId === s.id),
          )
          .map((r) => r.fiscalYear),
      ),
    ];
    return years.length ? ` · dipakai register TA ${years.join(', ')}` : '';
  };

  const row = (s: Stage, index: number | null) => (
    <div
      key={s.id}
      role="row"
      className={['stage-row', !s.active && 'is-inactive', dragId === s.id && 'is-dragging']
        .filter(Boolean)
        .join(' ')}
      draggable={s.active && editing !== s.id}
      onDragStart={() => setDragId(s.id)}
      onDragEnd={() => setDragId(null)}
      onDragOver={(e) => s.active && e.preventDefault()}
      onDrop={(e) => onDrop(e, s.id)}
    >
      <span role="cell">
        {s.active && (
          <button
            type="button"
            className="drag-handle"
            aria-label={`Pindahkan ${s.name}. Alt+panah atas/bawah untuk mengubah urutan`}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.altKey && e.key === 'ArrowUp') move(s.id, -1);
              if (e.altKey && e.key === 'ArrowDown') move(s.id, 1);
            }}
          >
            <GripVertical aria-hidden />
          </button>
        )}
      </span>
      <span role="cell" className="t-mono">
        {index ?? '—'}
      </span>
      <span role="cell" className="stage-row__name">
        {editing === s.id ? (
          <InlineName stage={s} onDone={() => setEditing(null)} />
        ) : (
          <>
            {s.name}
            {!s.active && <span className="t-caption">{usedLabel(s)}</span>}
          </>
        )}
      </span>
      <span role="cell" className="t-mono">
        {templates(s.id)}
      </span>
      <span role="cell">
        <Toggle
          label={s.active ? 'Aktif' : 'Nonaktif'}
          checked={s.active}
          onChange={(v) =>
            masterApi
              .setStageActive(s.id, v)
              .then(() =>
                toast.success(
                  v ? 'Tahap diaktifkan' : 'Tahap dinonaktifkan',
                  v
                    ? undefined
                    : 'Tahap ini tidak muncul di register baru; register lama tidak berubah.',
                ),
              )
          }
        />
      </span>
      <span role="cell" className="stage-row__actions">
        {editing !== s.id && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Ubah nama ${s.name}`}
            onClick={() => setEditing(s.id)}
          >
            <Pencil aria-hidden />
          </button>
        )}
        {!stageUsedByRegister(db, s.id) && templates(s.id) === 0 && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Hapus ${s.name}`}
            onClick={() => setToDelete(s)}
          >
            <Trash2 aria-hidden />
          </button>
        )}
      </span>
    </div>
  );

  return (
    <section className="accordion">
      <button type="button" className="accordion__head" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
        <span className="accordion__title">{type.name}</span>
        <LineChip line={1} />
        <span className="accordion__meta t-mono">
          {active.length} tahap{inactive.length ? ` aktif · ${inactive.length} nonaktif` : ''} ·{' '}
          {totalTemplates} template
        </span>
      </button>
      {open && (
        <div className="accordion__body">
          <div role="table" aria-label={`Tahap ${type.name}`} className="stage-table">
            <div role="row" className="stage-row stage-row--head">
              <span role="columnheader">
                <span className="sr-only">Urutkan</span>
              </span>
              <span role="columnheader">Urutan</span>
              <span role="columnheader">Nama tahap</span>
              <span role="columnheader">Template</span>
              <span role="columnheader">Aktif</span>
              <span role="columnheader">
                <span className="sr-only">Aksi</span>
              </span>
            </div>
            {active.map((s, i) => row(s, i + 1))}
            {inactive.map((s) => row(s, null))}
          </div>
          {adding !== null ? (
            <div className="inline-add">
              <input
                className="control"
                aria-label="Nama tahap baru"
                autoFocus
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setAdding(null);
                  if (e.key === 'Enter') {
                    try {
                      await masterApi.addStage(type.id, adding);
                      setAdding(null);
                      setAddError(null);
                      toast.success(
                        'Tahap ditambahkan',
                        'Tahap tanpa template tetap muncul di register (risiko sendiri dan pernyataan tersedia).',
                      );
                    } catch (err) {
                      setAddError((err as Error).message);
                    }
                  }
                }}
              />
              <span className={addError ? 'field__error' : 'field__helper'}>
                {addError ?? 'Enter menyimpan · Esc membatalkan'}
              </span>
            </div>
          ) : (
            <Button variant="ghost" icon={Plus} onClick={() => setAdding('')}>
              Tambah Tahap
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title={`Hapus tahap “${toDelete?.name}”?`}
        confirmLabel="Hapus Tahap"
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          try {
            await masterApi.deleteStage(toDelete!.id);
            toast.success('Tahap dihapus');
          } catch (e) {
            toast.error('Tahap tidak dapat dihapus', (e as Error).message);
          }
          setToDelete(null);
        }}
      >
        Tahap ini belum pernah dipakai register dan belum punya template, sehingga dapat dihapus.
      </ConfirmDialog>
    </section>
  );
}

/** /master/tahap — FR-MST-001, RB-MST-003, RB-MST-004. */
export default function StagesPage() {
  usePageMeta(['Master Data', 'Tahap']);
  const auth = useAuth();
  const types = useGateDb().positionTypes.filter((t) => t.line === 1 && t.hasTemplates);
  const [open, setOpen] = useState<string[]>(['pt-ppk']);
  return (
    <div className="master-page">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Tahap per Jenis Pemilik Risiko"
        subtitle="Tahap menentukan bagian register. Tahap yang pernah dipakai register tidak dapat dihapus, hanya dinonaktifkan; tahap nonaktif hilang dari register baru saja."
      />
      {types.map((t) => (
        <TypeSection
          key={t.id}
          type={t}
          open={open.includes(t.id)}
          onToggle={() =>
            setOpen((o) => (o.includes(t.id) ? o.filter((x) => x !== t.id) : [...o, t.id]))
          }
        />
      ))}
    </div>
  );
}
