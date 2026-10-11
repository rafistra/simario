import type { SnapshotInfo } from '@/data/api/sheets';
import { QUARTER_ROMAN } from '@/domain/calendar';
import {
  mutuFromPayload,
  type SheetAssessorValue,
  type SheetComment,
  type SheetPayload,
  type SheetRisk,
  type SheetSection,
} from '@/domain/rules/sheetPayload';
import { PREDICATE_LABEL, RISK_TYPE_LABEL } from '@/domain/types';
import { formatDate, formatDateTime, formatRupiah, formatScore } from '@/lib/format';

export interface DocMeta {
  snapshot: SnapshotInfo | null;
  /** Live view: the latest automatic version, for the header. */
  latestVersion: number | null;
  printedAt: string;
  masked: boolean;
  print?: boolean;
  signatures: SheetPayload['signatures'];
}

const tw = (n: number) => `TW ${QUARTER_ROMAN[n - 1]}`;

function value(v: SheetAssessorValue, waiting = 'Menunggu') {
  if (!v.opened) return <span className="doc__muted">{waiting}</span>;
  if (v.notAssessed) return <span className="doc__muted">Tidak dinilai</span>;
  if (v.notRelevant)
    return <span>Belum relevan{v.notRelevantReason ? ` — ${v.notRelevantReason}` : ''}</span>;
  if (v.score === null) return <span className="doc__muted">—</span>;
  return (
    <span>
      <span className="t-mono">{formatScore(v.score)}</span> ·{' '}
      {v.predicate ? PREDICATE_LABEL[v.predicate] : ''}
      {v.result === 'sesuai'
        ? ' · Sesuai'
        : v.result === 'tidak_sesuai'
          ? ' · Tidak Sesuai'
          : v.result === 'incomparable'
            ? ' · Tidak dapat dibandingkan'
            : ''}
    </span>
  );
}

function CommentLines({ list }: { list: SheetComment[] }) {
  return (
    <>
      {list.map((c) => (
        <p key={c.id} className="doc__line">
          <span className="doc__when t-mono">{formatDate(c.at)}</span> {c.author} ({c.role}) —{' '}
          {c.body}
          {c.files.length > 0 && (
            <span className="doc__muted"> [Lampiran: {c.files.join(', ')}]</span>
          )}
          {c.confidential > 0 && (
            <span className="doc__muted"> [{c.confidential} lampiran konfidensial]</span>
          )}
        </p>
      ))}
    </>
  );
}

function Header({ payload, meta, title }: { payload: SheetPayload; meta: DocMeta; title: string }) {
  const s = meta.snapshot;
  const version = s ? s.version : meta.latestVersion;
  return (
    <header className="doc__header">
      <div>
        <p className="doc__eyebrow">{title}</p>
        <h2 className="doc__title">
          Triwulan {QUARTER_ROMAN[payload.quarterNumber - 1]} · Tahun Anggaran {payload.fiscalYear}
        </h2>
        <p className="doc__sub">
          {payload.identity.unitName} · {payload.identity.positionName}
        </p>
      </div>
      <dl className="doc__stamp">
        <div>
          <dt>Nomor cetak</dt>
          <dd className="t-mono">{s ? s.number : 'Tampilan berjalan'}</dd>
        </div>
        <div>
          <dt>Versi</dt>
          <dd className="t-mono">
            {s?.isProvisional ? 'Sementara' : version ? `Versi ${version}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Tanggal</dt>
          <dd className="t-mono">{formatDateTime(s ? s.createdAt : meta.printedAt)}</dd>
        </div>
      </dl>
    </header>
  );
}

function Footer({ meta }: { meta: DocMeta }) {
  const s = meta.snapshot;
  return (
    <>
      <section className="doc__signs" aria-label="Tanda tangan">
        {meta.signatures.map((g) => (
          <div key={g.title} className="doc__sign">
            <p className="doc__sign-title">{g.title}</p>
            <p className="doc__sign-unit">{g.unit}</p>
            <span className="doc__sign-space" />
            <p className="doc__sign-name">{g.name || '(………………………)'}</p>
          </div>
        ))}
      </section>
      {meta.masked && <p className="doc__note">Sebagian isi disamarkan untuk pembaca ini.</p>}
      <p className="doc__footer">
        {!s
          ? 'Tampilan berjalan — isi berubah sampai arsip. Cetak membuat salinan beku bernomor. '
          : ''}
        Nomor cetak {s ? s.number : '—'} · Versi{' '}
        {s?.isProvisional || !s?.version ? 'Sementara' : s.version}. Dicetak dari SIMARIO pada{' '}
        {formatDateTime(s ? s.createdAt : meta.printedAt)}. Format keluaran resmi menyusul setelah
        Kepka 47 ditetapkan.
      </p>
    </>
  );
}

const SECTION_NOTE: Record<SheetSection, string> = {
  A: 'Langkah, penilaian, penjelasan',
  B: 'Koordinasi dan saran',
  C: 'Komentar dan penilaian Lini 3',
};

export function KomunikasiDocument({
  payload,
  meta,
  onPick,
}: {
  payload: SheetPayload;
  meta: DocMeta;
  onPick?: (section: SheetSection) => void;
}) {
  const id = payload.identity;
  const confidential = (sec: SheetSection) =>
    payload.risks.reduce(
      (n, r) =>
        n +
        (sec === 'A'
          ? [...r.steps, ...r.lini1Other]
          : sec === 'B'
            ? r.lini2
            : r.lini3Comments
        ).reduce((m, c) => m + c.confidential, 0),
      0,
    );
  const photos = (sec: SheetSection) => (
    <div className="doc__photos">
      {payload.photos[sec].map((p) => (
        <figure key={p.id} className="doc__photo">
          <span className="doc__photo-img" aria-hidden />
          <figcaption className="t-mono">{p.name}</figcaption>
        </figure>
      ))}
      {confidential(sec) > 0 && (
        <p className="doc__muted">{confidential(sec)} lampiran konfidensial tidak dicetak</p>
      )}
      {onPick && (
        <button type="button" className="link-add no-print" onClick={() => onPick(sec)}>
          Pilih foto untuk dicetak · {payload.photos[sec].length} dari maks. 5
        </button>
      )}
    </div>
  );
  const riskBlock = (r: SheetRisk, body: React.ReactNode) => (
    <div key={r.riskId} className="doc__risk">
      <p className="doc__risk-title">{r.description}</p>
      {body}
    </div>
  );
  return (
    <article
      className={[
        'doc',
        meta.print && 'doc--print',
        meta.snapshot?.isProvisional && 'is-provisional',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {meta.snapshot?.isProvisional && (
        <span className="doc__watermark" aria-hidden>
          SEMENTARA
        </span>
      )}
      <Header payload={payload} meta={meta} title="Lembar Komunikasi Tiga Lini" />
      <dl className="doc__identity">
        <div>
          <dt>Unit kerja</dt>
          <dd>
            {id.unitName} ({id.unitCode})
          </dd>
        </div>
        <div>
          <dt>Triwulan</dt>
          <dd>
            {id.period.replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, y, m, d) =>
              formatDate(`${y}-${m}-${d}`),
            )}
          </dd>
        </div>
        <div>
          <dt>Jabatan</dt>
          <dd>{id.positionName}</dd>
        </div>
        <div>
          <dt>Tujuan</dt>
          <dd>{id.tujuan}</dd>
        </div>
        <div>
          <dt>Pejabat</dt>
          <dd>{id.officialName || '—'}</dd>
        </div>
        <div>
          <dt>Besar anggaran</dt>
          <dd className="t-mono">
            {id.besarAnggaran !== null ? formatRupiah(id.besarAnggaran) : '—'}
          </dd>
        </div>
      </dl>

      <section className="doc__section">
        <h3 className="doc__section-title">
          <span className="t-mono">Bagian A</span> Lini 1 · {id.positionName}{' '}
          <span className="doc__muted">{SECTION_NOTE.A}</span>
        </h3>
        {payload.risks.map((r) =>
          riskBlock(
            r,
            <>
              <p className="doc__kv">
                <span>Penilaian</span>
                {value(r.l1, 'Menunggu perbandingan')}
              </p>
              <div className="doc__kv">
                <span>Langkah</span>
                <div>
                  {r.steps.length ? (
                    <CommentLines list={r.steps} />
                  ) : (
                    <p className="doc__muted">{r.quiet ? 'Tidak ada langkah tercatat' : '—'}</p>
                  )}
                </div>
              </div>
              {r.explanations.map((e) => (
                <div key={e.directorate} className="doc__kv">
                  <span>Penjelasan · {e.directorate.replace('Direktorat ', '')}</span>
                  <div>
                    <p className="doc__line">Alasan/Kendala: {e.reason}</p>
                    <p className="doc__line">Rencana Tindak Lanjut: {e.plan}</p>
                    <p className="doc__muted">
                      Dikirim {formatDateTime(e.sentAt)} oleh {e.sentBy}
                      {e.late ? ' · Terlambat' : ''}
                    </p>
                  </div>
                </div>
              ))}
              {r.pendingExplanations > 0 && (
                <p className="doc__muted">{r.pendingExplanations} penjelasan wajib belum dikirim</p>
              )}
            </>,
          ),
        )}
        {photos('A')}
      </section>

      <section className="doc__section">
        <h3 className="doc__section-title">
          <span className="t-mono">Bagian B</span> Lini 2{' '}
          <span className="doc__muted">{SECTION_NOTE.B}</span>
        </h3>
        {payload.risks.some((r) => r.lini2.length) ? (
          payload.risks
            .filter((r) => r.lini2.length)
            .map((r) => riskBlock(r, <CommentLines list={r.lini2} />))
        ) : (
          <p className="doc__muted">Tidak ada masukan Lini 2 pada triwulan ini</p>
        )}
        {photos('B')}
      </section>

      <section className="doc__section">
        <h3 className="doc__section-title">
          <span className="t-mono">Bagian C</span> Lini 3{' '}
          <span className="doc__muted">{SECTION_NOTE.C}</span>
        </h3>
        {payload.risks.map((r) =>
          riskBlock(
            r,
            <>
              {r.lini3.map((x) => (
                <div key={x.positionId} className="doc__kv">
                  <span>{x.name.replace('Direktorat ', '')}</span>
                  <div>
                    {value(x)}
                    {x.opened && x.note && <p className="doc__line">Catatan: “{x.note}”</p>}
                  </div>
                </div>
              ))}
              {r.recurring && (
                <p className="doc__flag">
                  Berulang — Kurang Terkendali dua triwulan berturut-turut
                </p>
              )}
              {r.lini3Comments.length > 0 && (
                <div className="doc__kv">
                  <span>Komentar</span>
                  <div>
                    <CommentLines list={r.lini3Comments} />
                  </div>
                </div>
              )}
            </>,
          ),
        )}
        {photos('C')}
      </section>
      <Footer meta={meta} />
    </article>
  );
}

export function MutuDocument({ payload, meta }: { payload: SheetPayload; meta: DocMeta }) {
  const m = mutuFromPayload(payload);
  return (
    <article
      className={[
        'doc',
        meta.print && 'doc--print',
        meta.snapshot?.isProvisional && 'is-provisional',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {meta.snapshot?.isProvisional && (
        <span className="doc__watermark" aria-hidden>
          SEMENTARA
        </span>
      )}
      <Header payload={payload} meta={meta} title="Lembar Mutu" />
      <table className="doc__table">
        <caption className="sr-only">
          Rata-rata skor per jenis risiko, {tw(payload.quarterNumber)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Jenis risiko</th>
            {payload.assessors.map((a) => (
              <th key={a.positionId} scope="col">
                {a.line === 1 ? `Lini 1 · ${a.name}` : a.name.replace('Direktorat ', '')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.riskType}>
              <th scope="row">{RISK_TYPE_LABEL[r.riskType]}</th>
              {r.cells.map((c, i) => (
                <td key={payload.assessors[i]!.positionId}>
                  {c.average !== null ? (
                    <>
                      <span className="t-mono">{formatScore(c.average)}</span> ·{' '}
                      {c.predicate ? PREDICATE_LABEL[c.predicate] : ''}
                    </>
                  ) : (
                    <span className="doc__muted">{c.opened ? 'Tidak ada nilai' : 'Menunggu'}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="doc__counts t-mono">
        {m.sesuai} Sesuai · {m.tidakSesuai} Tidak Sesuai · {m.berulang} Berulang
      </p>
      <section className="doc__section">
        <h3 className="doc__section-title">
          Temuan · Tidak dinilai Lini 1 ({m.notAssessedL1.length})
        </h3>
        {m.notAssessedL1.length ? (
          <ol className="doc__list">
            {m.notAssessedL1.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ol>
        ) : (
          <p className="doc__muted">Tidak ada.</p>
        )}
        <p className="doc__muted">
          Rata-rata hanya atas risiko yang hasil penilainya sudah dibuka; Belum relevan dan Tidak
          dinilai dikecualikan.
        </p>
      </section>
      <Footer meta={meta} />
    </article>
  );
}
