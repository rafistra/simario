import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState, type DragEvent } from 'react';
import { Button, ConfirmDialog, InlineAlert, SlideOver, Textarea, toast } from '@/components';
import { masterApi } from '@/data/repository';
import { templateEverUsed, templateUsage } from '@/data/api/master';
import { useGateDb } from '@/components/DataGate/gateDb';
import { RISK_TYPE_LABEL, type RiskType } from '@/domain/types';
import { useAuth } from '@/state/useAuth';
import './Master.css';

export interface TemplateEditorTarget {
  /** Existing template id, or null to create one. */
  id: string | null;
  positionTypeId: string;
  stageId: string;
  riskType: RiskType;
  /** Prefill (from a proposal). */
  description?: string;
  mitigations?: string[];
  fromProposalId?: string;
}

/** Template SlideOver (frame Bs7b9): wording, ordered mitigations, usage warning; no score fields. */
export function TemplateEditor({
  target,
  onClose,
}: {
  target: TemplateEditorTarget | null;
  onClose: () => void;
}) {
  const db = useGateDb();
  const auth = useAuth();
  const [description, setDescription] = useState('');
  const [mitigations, setMitigations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!target) return;
    const tpl = target.id ? db.riskTemplates.find((t) => t.id === target.id) : undefined;
    setDescription(tpl?.description ?? target.description ?? '');
    setMitigations(
      tpl
        ? db.mitigationTemplates
            .filter((m) => m.riskTemplateId === tpl.id)
            .sort((a, b) => a.order - b.order)
            .map((m) => m.description)
        : (target.mitigations ?? []),
    );
    setError(null);
    // Only reset when a different template is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.fromProposalId, target?.stageId, target?.riskType]);

  if (!target) return null;
  const type = db.positionTypes.find((t) => t.id === target.positionTypeId)!;
  const stage = db.stages.find((s) => s.id === target.stageId)!;
  const usage = target.id ? templateUsage(db, target.id, auth.currentFiscalYear) : 0;
  const deletable = target.id !== null && !templateEverUsed(db, target.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= mitigations.length) return;
    setMitigations((ms) => {
      const next = [...ms];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await masterApi.saveTemplate(
        {
          positionTypeId: type.id,
          stageId: stage.id,
          riskType: target.riskType,
          description,
          mitigations,
        },
        target.id ?? undefined,
        target.fromProposalId,
      );
      toast.success(
        target.fromProposalId ? 'Usulan dijadikan template' : 'Template disimpan',
        'Register yang sudah ada tidak berubah.',
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SlideOver
        open
        eyebrow={`${type.name} › ${stage.name} › ${RISK_TYPE_LABEL[target.riskType]}`}
        title={
          target.fromProposalId
            ? 'Jadikan Template'
            : target.id
              ? 'Ubah Template'
              : 'Tambah Template'
        }
        onClose={onClose}
        footer={
          <>
            {deletable && (
              <Button
                variant="ghost"
                icon={Trash2}
                className="slide-over__left"
                onClick={() => setConfirmDelete(true)}
              >
                Hapus
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button icon={Save} loading={saving} onClick={save}>
              Simpan Template
            </Button>
          </>
        }
      >
        {usage > 0 && (
          <InlineAlert
            variant="warning"
            title={`Template ini dipakai ${usage} jabatan pada TA berjalan.`}
          >
            Perubahan tidak memengaruhi register yang sudah ada.
          </InlineAlert>
        )}
        <Textarea
          label="Uraian risiko"
          required
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={error ?? undefined}
        />
        <div className="mitigation-editor">
          <p className="field__label">Mitigasi ({mitigations.filter((m) => m.trim()).length})</p>
          <ol className="mitigation-editor__list">
            {mitigations.map((m, i) => (
              <li
                key={i}
                className={['mitigation-editor__item', dragIndex === i && 'is-dragging']
                  .filter(Boolean)
                  .join(' ')}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e: DragEvent) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
              >
                <button
                  type="button"
                  className="drag-handle"
                  aria-label={`Pindahkan mitigasi ${i + 1}. Alt+panah atas/bawah untuk mengubah urutan`}
                  onKeyDown={(e) => {
                    if (e.altKey && e.key === 'ArrowUp') move(i, i - 1);
                    if (e.altKey && e.key === 'ArrowDown') move(i, i + 1);
                  }}
                >
                  <GripVertical aria-hidden />
                </button>
                <textarea
                  className="control control--textarea mitigation-editor__text"
                  rows={2}
                  aria-label={`Mitigasi ${i + 1}`}
                  value={m}
                  onChange={(e) =>
                    setMitigations((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                <span className="mitigation-editor__tools">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Naikkan"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                  >
                    <ArrowUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Turunkan"
                    onClick={() => move(i, i + 1)}
                    disabled={i === mitigations.length - 1}
                  >
                    <ArrowDown aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Hapus mitigasi ${i + 1}`}
                    onClick={() => setMitigations((ms) => ms.filter((_, j) => j !== i))}
                  >
                    <X aria-hidden />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <Button variant="ghost" icon={Plus} onClick={() => setMitigations((ms) => [...ms, ''])}>
            Tambah mitigasi
          </Button>
          <p className="field__helper">
            Urutan menentukan tampilan pada kartu risiko di register baru. Mitigasi kosong dihapus
            saat disimpan.
          </p>
        </div>
      </SlideOver>
      <ConfirmDialog
        open={confirmDelete}
        destructive
        title="Hapus template ini?"
        confirmLabel="Hapus Template"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await masterApi.deleteTemplate(target.id!);
            toast.success('Template dihapus');
            setConfirmDelete(false);
            onClose();
          } catch (e) {
            toast.error('Template tidak dapat dihapus', (e as Error).message);
            setConfirmDelete(false);
          }
        }}
      >
        Template ini belum pernah dipakai register, sehingga dapat dihapus permanen.
      </ConfirmDialog>
    </>
  );
}
