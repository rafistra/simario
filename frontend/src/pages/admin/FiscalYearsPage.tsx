import { Archive, CalendarPlus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  InlineAlert,
  PageHeader,
  StatusChip,
  TextInput,
  toast,
} from '@/components';
import { archiveStatus, quarterProblems } from '@/data/api/calendar';
import { ApiError, calendarApi } from '@/data/repository';
import { useGateDb } from '@/components/DataGate/gateDb';
import type { Quarter } from '@/domain/types';
import { usePageMeta } from '@/layout/pageMeta';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/state/useAuth';
import './Admin.css';

const FIELDS: { key: keyof Quarter; label: string }[] = [
  { key: 'startsOn', label: 'Mulai' },
  { key: 'endsOn', label: 'Akhir' },
  { key: 'lini1OpensOn', label: 'Jendela Lini 1' },
  { key: 'lini1Deadline', label: 'Tenggat Lini 1' },
  { key: 'lini3OpensOn', label: 'Jendela Lini 3' },
  { key: 'lini3Deadline', label: 'Tenggat Lini 3' },
];

const STATUS = {
  open: { kind: 'terbit', label: 'Berjalan' },
  closing: { kind: 'menunggu', label: 'Penutupan' },
  archived: { kind: 'diarsipkan', label: 'Diarsipkan' },
} as const;

/** /pengaturan/tahun-anggaran — FR-ADM-007, §2.5, INV-9. */
export default function FiscalYearsPage() {
  usePageMeta(['Pengaturan', 'Tahun Anggaran']);
  const auth = useAuth();
  const db = useGateDb();
  const years = [...db.fiscalYears].sort((a, b) => b.year - a.year);
  const [year, setYear] = useState(
    years.find((y) => y.status !== 'archived')?.year ?? years[0]!.year,
  );
  const fy = db.fiscalYears.find((f) => f.year === year)!;
  const saved = db.quarters
    .filter((q) => q.fiscalYear === year)
    .sort((a, b) => a.number - b.number);
  const [draft, setDraft] = useState<Quarter[]>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as Quarter[]), [savedKey]);
  const [tol, setTol] = useState(String(fy.toleranceDays));
  const [grace, setGrace] = useState(String(fy.archiveGraceDays));
  useEffect(() => {
    setTol(String(fy.toleranceDays));
    setGrace(String(fy.archiveGraceDays));
  }, [fy.toleranceDays, fy.archiveGraceDays]);
  const [confirmPast, setConfirmPast] = useState<Quarter | null>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [exclude, setExclude] = useState<{ quarterId: string; positionId: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const archived = fy.status === 'archived';
  const problems = quarterProblems(year, draft);
  const st = archiveStatus(db, year, auth.today);
  const canArchive = auth.can(26);

  const saveQuarter = async (q: Quarter, confirm = false) => {
    setError(null);
    const orig = saved.find((x) => x.id === q.id)!;
    const patch = Object.fromEntries(
      [...FIELDS.map((f) => f.key), 'explanationWorkdays']
        .filter((k) => q[k as keyof Quarter] !== orig[k as keyof Quarter])
        .map((k) => [k, q[k as keyof Quarter]]),
    );
    if (Object.keys(patch).length === 0) return;
    try {
      await calendarApi.updateQuarter(q.id, patch, confirm);
      toast.success(`TW ${['I', 'II', 'III', 'IV'][q.number - 1]} disimpan`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'confirm') setConfirmPast(q);
      else setError((e as Error).message);
    }
  };

  return (
    <div className="adm">
      <PageHeader
        eyebrow="Pengaturan"
        title="Tahun Anggaran"
        subtitle="Triwulan, jendela penilaian, tenggat, dan arsip (§2.5)."
        actions={
          <Button
            icon={CalendarPlus}
            onClick={async () => {
              const next = Math.max(...years.map((y) => y.year)) + 1;
              try {
                await calendarApi.createFiscalYear(next);
                setYear(next);
                toast.success(`TA ${next} dibuat dengan empat triwulan bawaan`);
              } catch (e) {
                toast.error('Gagal', (e as Error).message);
              }
            }}
          >
            Buat Tahun Anggaran
          </Button>
        }
      />
      <div className="fy">
        <aside className="fy__years" aria-label="Tahun anggaran">
          {years.map((y) => (
            <button
              key={y.year}
              type="button"
              className={['roles__item', y.year === year && 'is-active'].filter(Boolean).join(' ')}
              onClick={() => setYear(y.year)}
              aria-pressed={y.year === year}
            >
              <span className="roles__name">
                TA {y.year}
                <span className="adm__sub">
                  {y.archivedAt ? `diarsipkan ${formatDate(y.archivedAt)}` : ''}
                </span>
              </span>
              <StatusChip status={STATUS[y.status].kind} label={STATUS[y.status].label} />
            </button>
          ))}
        </aside>
        <div className="fy__main">
          {archived && (
            <InlineAlert variant="info" title={`TA ${year} sudah diarsipkan`}>
              Semua isi tahun anggaran ini hanya dapat dibaca (INV-21).
            </InlineAlert>
          )}
          {error && <InlineAlert variant="error" title={error} />}
          <Card eyebrow={`TA ${year}`} title="Toleransi dan arsip">
            <div className="adm__row">
              <TextInput
                label="Toleransi (hari)"
                inputMode="numeric"
                value={tol}
                disabled={archived}
                onChange={(e) => setTol(e.target.value)}
              />
              <TextInput
                label="Masa arsip (hari)"
                inputMode="numeric"
                value={grace}
                disabled={archived}
                onChange={(e) => setGrace(e.target.value)}
              />
              {!archived && (
                <Button
                  variant="secondary"
                  icon={Save}
                  onClick={() =>
                    void calendarApi
                      .updateFiscalYear(year, {
                        toleranceDays: Number(tol),
                        archiveGraceDays: Number(grace),
                      })
                      .then(
                        () => toast.success('Disimpan'),
                        (e: Error) => setError(e.message),
                      )
                  }
                >
                  Simpan
                </Button>
              )}
            </div>
          </Card>

          <Card eyebrow="Triwulan" title="Jendela dan tenggat">
            {problems.length > 0 && (
              <InlineAlert variant="error" title="Urutan tanggal tidak valid">
                <ul className="adm__bullets">
                  {problems.map((p) => (
                    <li key={p.quarterId + p.field}>{p.message}</li>
                  ))}
                </ul>
              </InlineAlert>
            )}
            <div className="fy__table" role="table" aria-label={`Triwulan TA ${year}`}>
              <div className="fy__row fy__row--head" role="row">
                <span role="columnheader">TW</span>
                {FIELDS.map((f) => (
                  <span key={f.key} role="columnheader">
                    {f.label}
                  </span>
                ))}
                <span role="columnheader">Hari kerja penjelasan</span>
                <span role="columnheader" />
              </div>
              {draft.map((q, i) => (
                <div key={q.id} className="fy__row" role="row">
                  <span role="rowheader" className="t-mono">
                    TW {['I', 'II', 'III', 'IV'][q.number - 1]}
                  </span>
                  {FIELDS.map((f) => {
                    const bad = problems.some((p) => p.quarterId === q.id && p.field === f.key);
                    return (
                      <input
                        key={f.key}
                        type="date"
                        role="cell"
                        aria-label={`${f.label} TW ${q.number}`}
                        aria-invalid={bad || undefined}
                        className={['control control--date fy__date', bad && 'is-bad']
                          .filter(Boolean)
                          .join(' ')}
                        value={q[f.key] as string}
                        disabled={archived}
                        onChange={(e) =>
                          setDraft(
                            draft.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)),
                          )
                        }
                      />
                    );
                  })}
                  <input
                    type="number"
                    min={1}
                    role="cell"
                    aria-label={`Hari kerja penjelasan TW ${q.number}`}
                    className="control fy__num"
                    value={q.explanationWorkdays}
                    disabled={archived}
                    onChange={(e) =>
                      setDraft(
                        draft.map((x, j) =>
                          j === i ? { ...x, explanationWorkdays: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  {!archived && (
                    <Button
                      variant="ghost"
                      disabled={problems.length > 0}
                      onClick={() => void saveQuarter(q)}
                    >
                      Simpan
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card eyebrow="Penilai Lini 3" title="Set penilai per triwulan">
            {saved.map((q) => {
              const set = db.quarterAssessors.filter((x) => x.quarterId === q.id);
              return (
                <div key={q.id} className="fy__assessors">
                  <span className="t-mono">TW {['I', 'II', 'III', 'IV'][q.number - 1]}</span>
                  {set.length === 0 ? (
                    <span className="adm__sub">
                      Ditetapkan saat jendela Lini 3 dibuka ({formatDate(q.lini3OpensOn)})
                    </span>
                  ) : (
                    set.map((a) => (
                      <span key={a.positionId} className="fy__assessor">
                        {db.positions.find((p) => p.id === a.positionId)?.name}
                        {a.excluded ? (
                          <span className="adm__warn"> · dikecualikan: {a.exclusionReason}</span>
                        ) : (
                          !archived && (
                            <button
                              type="button"
                              className="text-link"
                              onClick={() =>
                                setExclude({ quarterId: q.id, positionId: a.positionId })
                              }
                            >
                              Kecualikan
                            </button>
                          )
                        )}
                      </span>
                    ))
                  )}
                </div>
              );
            })}
          </Card>

          <Card
            eyebrow="Arsip"
            title={
              archived
                ? `Diarsipkan ${fy.archivedAt ? formatDate(fy.archivedAt) : ''} (${fy.archivedBy === 'manual' ? 'manual' : 'batas akhir'})`
                : 'Status penutupan'
            }
          >
            {!archived && (
              <>
                <dl className="adm__kv">
                  <div>
                    <dt>Batas akhir dasar</dt>
                    <dd className="t-mono">{formatDate(st.baseHardLimit)}</dd>
                  </div>
                  <div>
                    <dt>Perkiraan arsip otomatis</dt>
                    <dd className="t-mono">{formatDate(st.projected)}</dd>
                  </div>
                  <div>
                    <dt>TW IV lengkap</dt>
                    <dd>{st.tw4Complete ? 'Ya' : 'Belum'}</dd>
                  </div>
                </dl>
                {st.blockers.length > 0 && (
                  <ul className="adm__bullets">
                    {st.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                {canArchive && (
                  <Button
                    variant="secondary"
                    icon={Archive}
                    onClick={() =>
                      st.tw4Complete
                        ? setArchiveAsk(true)
                        : toast.error('Belum dapat diarsipkan', st.blockers.join('; '))
                    }
                  >
                    Arsipkan Sekarang
                  </Button>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmPast}
        title="Ubah tenggat yang sudah lewat?"
        confirmLabel="Ubah Tenggat"
        onCancel={() => setConfirmPast(null)}
        onConfirm={() => {
          const q = confirmPast!;
          setConfirmPast(null);
          void saveQuarter(q, true);
        }}
      >
        Tenggat ini sudah lewat. Keterlambatan yang sudah tercatat tidak dihitung ulang.
      </ConfirmDialog>
      <ConfirmDialog
        open={archiveAsk}
        destructive
        title={`Arsipkan TA ${year}?`}
        confirmLabel="Arsipkan"
        onCancel={() => setArchiveAsk(false)}
        onConfirm={async () => {
          setArchiveAsk(false);
          try {
            await calendarApi.archiveManually(year);
            toast.success(`TA ${year} diarsipkan`);
          } catch (e) {
            toast.error('Gagal mengarsipkan', (e as Error).message);
          }
        }}
      >
        Penilaian yang belum dituntaskan menjadi “Tidak dinilai”, penjelasan wajib yang belum
        dikirim menjadi “Tidak dikirim”, versi akhir lembar dibekukan, dan seluruh isi TA menjadi
        hanya-baca.
      </ConfirmDialog>
      <ConfirmDialog
        open={!!exclude}
        destructive
        title="Kecualikan penilai dari triwulan ini?"
        confirmLabel="Kecualikan"
        onCancel={() => setExclude(null)}
        onConfirm={async () => {
          try {
            await calendarApi.excludeAssessor(exclude!.quarterId, exclude!.positionId, reason);
            toast.success('Penilai dikecualikan');
            setExclude(null);
            setReason('');
          } catch (e) {
            toast.error('Gagal', (e as Error).message);
          }
        }}
      >
        <p>
          Draf penilaian direktorat ini dibuang dan pembukaan perbandingan setiap risiko dievaluasi
          ulang.
        </p>
        <TextInput
          label="Alasan"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
