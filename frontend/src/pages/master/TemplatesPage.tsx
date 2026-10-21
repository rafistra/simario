import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchField,
  Select,
  Toggle,
  toast,
  type Column,
} from '@/components';
import { masterApi } from '@/data/repository';
import { templateEverUsed, templateUsage } from '@/data/derive/master';
import { useGateDb } from '@/components/DataGate/gateDb';
import { RISK_TYPES, RISK_TYPE_LABEL, type RiskTemplate, type RiskType } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import { TemplateEditor, type TemplateEditorTarget } from './TemplateEditor';
import './Master.css';

interface Node {
  typeId: string;
  stageId: string;
  riskType: RiskType;
}

const PAGE = 25;

/** /master/template — FR-MST-002, 003, 004. */
export default function TemplatesPage() {
  usePageMeta(['Master Data', 'Template']);
  const auth = useAuth();
  const db = useGateDb();
  const types = db.positionTypes.filter((t) => t.line === 1 && t.hasTemplates);
  const stagesOf = (typeId: string) =>
    db.stages
      .filter((s) => s.positionTypeId === typeId)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
  const [node, setNode] = useState<Node>({
    typeId: 'pt-ppk',
    stageId: 'stg-PPK-T1',
    riskType: 'kinerja_anggaran',
  });
  const [expanded, setExpanded] = useState<string[]>(['pt-ppk', 'stg-PPK-T1']);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TemplateEditorTarget | null>(null);

  const count = (pred: (t: RiskTemplate) => boolean) => db.riskTemplates.filter(pred).length;
  const toggle = (id: string) =>
    setExpanded((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const select = (n: Node) => {
    setNode(n);
    setPage(1);
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return db.riskTemplates
      .filter((t) =>
        needle
          ? t.positionTypeId === node.typeId
          : t.stageId === node.stageId && t.riskType === node.riskType,
      )
      .filter((t) => !needle || t.description.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.order - b.order);
  }, [db.riskTemplates, node, query]);

  const type = db.positionTypes.find((t) => t.id === node.typeId)!;
  const stage = db.stages.find((s) => s.id === node.stageId);

  const columns: Column<RiskTemplate>[] = [
    {
      key: 'tpl',
      header: 'Template',
      primary: true,
      render: (t) => {
        const n = db.mitigationTemplates.filter((m) => m.riskTemplateId === t.id).length;
        return (
          <span className="cell-title">
            <strong>{t.description}</strong>
            <span className="t-caption">
              {query
                ? `${db.stages.find((s) => s.id === t.stageId)?.name} · ${RISK_TYPE_LABEL[t.riskType]} · `
                : ''}
              {n} mitigasi{!t.active && ' · nonaktif — tidak ditawarkan untuk register baru'}
            </span>
          </span>
        );
      },
    },
    {
      key: 'usage',
      header: `Pemakaian TA ${auth.currentFiscalYear}`,
      width: 210,
      render: (t) => {
        const n = templateUsage(db, t.id, auth.currentFiscalYear);
        if (n > 0) return <span className="usage-badge">Dipakai {n} jabatan</span>;
        return (
          <span className="usage-badge usage-badge--idle">
            {templateEverUsed(db, t.id) ? 'Tidak dipakai TA ini' : 'Tidak dipakai · dapat dihapus'}
          </span>
        );
      },
    },
    {
      key: 'active',
      header: 'Aktif',
      width: 120,
      render: (t) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Toggle
            label={t.active ? 'Aktif' : 'Nonaktif'}
            checked={t.active}
            onChange={(v) =>
              masterApi
                .setTemplateActive(t.id, v)
                .then(() =>
                  toast.success(
                    v ? 'Template diaktifkan' : 'Template dinonaktifkan',
                    v
                      ? undefined
                      : 'Tidak lagi ditawarkan untuk register baru dan salinan TA berikutnya.',
                  ),
                )
            }
          />
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Diperbarui',
      width: 110,
      align: 'right',
      render: (t) => <span className="t-mono">{t.updatedAt ? formatDate(t.updatedAt) : '—'}</span>,
    },
  ];

  return (
    <div className="master-page">
      <PageHeader
        eyebrow={`Master data · TA ${auth.currentFiscalYear}`}
        title="Template Risiko"
        subtitle="Template risiko dan mitigasi per jenis pemilik risiko, tahap, dan jenis risiko. Perubahan tidak memengaruhi register yang sudah ada."
        actions={
          <Button
            icon={Plus}
            onClick={() =>
              setEditing({
                id: null,
                positionTypeId: node.typeId,
                stageId: node.stageId,
                riskType: node.riskType,
              })
            }
          >
            Tambah Template
          </Button>
        }
      />

      <div className="template-layout">
        <nav className="template-tree" aria-label="Pohon template">
          <ul role="tree">
            {types.map((t) => (
              <li key={t.id} role="treeitem" aria-expanded={expanded.includes(t.id)}>
                <button
                  type="button"
                  className="tree-node tree-node--l1"
                  onClick={() => toggle(t.id)}
                >
                  {expanded.includes(t.id) ? (
                    <ChevronDown aria-hidden />
                  ) : (
                    <ChevronRight aria-hidden />
                  )}
                  <span className="tree-node__label">{t.name}</span>
                  <span className="tree-node__count">
                    {count((x) => x.positionTypeId === t.id)}
                  </span>
                </button>
                {expanded.includes(t.id) && (
                  <ul role="group">
                    {stagesOf(t.id).map((s) => (
                      <li key={s.id} role="treeitem" aria-expanded={expanded.includes(s.id)}>
                        <button
                          type="button"
                          className={['tree-node tree-node--l2', !s.active && 'is-inactive']
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => toggle(s.id)}
                        >
                          {expanded.includes(s.id) ? (
                            <ChevronDown aria-hidden />
                          ) : (
                            <ChevronRight aria-hidden />
                          )}
                          <span className="tree-node__label">{s.name}</span>
                          <span className="tree-node__count">
                            {count((x) => x.stageId === s.id)}
                          </span>
                        </button>
                        {expanded.includes(s.id) && (
                          <ul role="group">
                            {RISK_TYPES.map((rt) => {
                              const selected =
                                node.stageId === s.id && node.riskType === rt && !query;
                              return (
                                <li key={rt} role="treeitem" aria-selected={selected}>
                                  <button
                                    type="button"
                                    className={[
                                      'tree-node tree-node--l3',
                                      selected && 'is-selected',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                    onClick={() => {
                                      setQuery('');
                                      select({ typeId: t.id, stageId: s.id, riskType: rt });
                                    }}
                                  >
                                    <span className="tree-node__label">{RISK_TYPE_LABEL[rt]}</span>
                                    <span className="tree-node__count">
                                      {count((x) => x.stageId === s.id && x.riskType === rt)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {/* Below 900 px the tree becomes cascading dropdowns (§10.3). */}
        <div className="template-cascade">
          <Select
            label="Jenis pemilik risiko"
            value={node.typeId}
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(e) => {
              const first = stagesOf(e.target.value)[0]!;
              select({ typeId: e.target.value, stageId: first.id, riskType: 'kinerja_anggaran' });
            }}
          />
          <Select
            label="Tahap"
            value={node.stageId}
            options={stagesOf(node.typeId).map((s) => ({
              value: s.id,
              label: s.active ? s.name : `${s.name} (nonaktif)`,
            }))}
            onChange={(e) => select({ ...node, stageId: e.target.value })}
          />
          <Select
            label="Jenis risiko"
            value={node.riskType}
            options={RISK_TYPES.map((r) => ({ value: r, label: RISK_TYPE_LABEL[r] }))}
            onChange={(e) => select({ ...node, riskType: e.target.value as RiskType })}
          />
        </div>

        <section className="template-list">
          <header className="template-list__head">
            <div>
              <p className="t-eyebrow">
                {query ? `${type.name} · pencarian` : `${type.name} › ${stage?.name ?? ''}`}
              </p>
              <h2 className="template-list__title">
                {query ? `Hasil “${query}”` : RISK_TYPE_LABEL[node.riskType]} · {rows.length}{' '}
                template
              </h2>
            </div>
            <SearchField
              label="Cari uraian template"
              placeholder="Cari uraian template…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </header>
          <DataTable
            caption="Daftar template"
            columns={columns}
            rows={rows.slice((page - 1) * PAGE, page * PAGE)}
            rowKey={(t) => t.id}
            rowClassName={(t) => (t.active ? undefined : 'is-dimmed')}
            onRowClick={(t) =>
              setEditing({
                id: t.id,
                positionTypeId: t.positionTypeId,
                stageId: t.stageId,
                riskType: t.riskType,
              })
            }
            empty={
              <EmptyState
                title="Belum ada template di simpul ini"
                message="Register tetap dapat memakai risiko sendiri pada tahap ini. Tambahkan template agar uraian seragam."
                action={
                  <Button
                    icon={Plus}
                    onClick={() =>
                      setEditing({
                        id: null,
                        positionTypeId: node.typeId,
                        stageId: node.stageId,
                        riskType: node.riskType,
                      })
                    }
                  >
                    Tambah Template
                  </Button>
                }
              />
            }
            footer={
              rows.length > PAGE ? (
                <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
              ) : undefined
            }
          />
        </section>
      </div>
      <TemplateEditor target={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
