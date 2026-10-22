import {
  BadgeCheck,
  Ban,
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleSlash,
  CircleX,
  Clock3,
  ClockAlert,
  FileText,
  FileX,
  Lock,
  Repeat,
  ShieldOff,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Capacity, Line, Predicate } from '@/domain/types';
import { PREDICATE_LABEL } from '@/domain/types';
import { initials as toInitials } from '@/lib/format';
import './Chips.css';

/** LineChip_Lini1/2/3 (.pen KoPKc, skm85, m8q8t). */
export function LineChip({ line }: { line: Line }) {
  return <span className={`chip chip--line chip--lini${line}`}>Lini {line}</span>;
}

/** CapacityChip_Pejabat / _Operator (.pen n00Yw, A15etO). */
export function CapacityChip({ capacity }: { capacity: Capacity }) {
  const Icon = capacity === 'pejabat' ? BadgeCheck : UserCog;
  return (
    <span className={`chip chip--capacity chip--${capacity}`}>
      <Icon aria-hidden />
      {capacity === 'pejabat' ? 'Pejabat' : 'Operator'}
    </span>
  );
}

const PREDICATE_ICON: Record<Predicate, LucideIcon> = {
  terkendali: CircleCheck,
  cukup: CircleAlert,
  kurang: CircleX,
};

/** PredicateBadge_* (.pen y3t8J, wuFjS, nJ5J6): icon + text, never colour alone. */
export function PredicateBadge({ predicate }: { predicate: Predicate }) {
  const Icon = PREDICATE_ICON[predicate];
  return (
    <span className={`chip chip--badge chip--pred-${predicate}`}>
      <Icon aria-hidden />
      {PREDICATE_LABEL[predicate]}
    </span>
  );
}

export type StatusKind =
  | 'draf'
  | 'siap'
  | 'terbit'
  | 'diarsipkan'
  | 'dituntaskan'
  | 'menunggu'
  | 'terbuka-sebagian'
  | 'terbuka';

const STATUS_LABEL: Record<StatusKind, string> = {
  draf: 'Draf',
  siap: 'Siap Diterbitkan',
  terbit: 'Terbit',
  diarsipkan: 'Diarsipkan',
  dituntaskan: 'Dituntaskan',
  menunggu: 'Menunggu',
  'terbuka-sebagian': 'Terbuka sebagian',
  terbuka: 'Terbuka',
};

/** StatusChip_* (.pen Rh2mr … e0SvJu): dotted pill (Aksara). `label` overrides the default text. */
export function StatusChip({ status, label }: { status: StatusKind; label?: string }) {
  return (
    <span className={`chip chip--status chip--status-${status}`}>
      <span className="chip__dot" aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export type MarkerKind =
  | 'belum-langkah'
  | 'tidak-sesuai'
  | 'sesuai'
  | 'berulang'
  | 'tanpa-mitigasi'
  | 'tanpa-bukti'
  | 'nonaktif'
  | 'terlambat'
  | 'sangat-terlambat'
  | 'konfidensial'
  | 'belum-relevan'
  | 'tidak-dinilai'
  | 'langkah';

const MARKER: Record<MarkerKind, { icon: LucideIcon; label: string; tone: string }> = {
  'belum-langkah': { icon: CircleDashed, label: 'Belum ada langkah triwulan ini', tone: 'warn' },
  'tidak-sesuai': { icon: X, label: 'Tidak Sesuai', tone: 'danger' },
  sesuai: { icon: Check, label: 'Sesuai', tone: 'success' },
  berulang: { icon: Repeat, label: 'Berulang', tone: 'danger' },
  'tanpa-mitigasi': { icon: ShieldOff, label: 'Tanpa mitigasi', tone: 'warn' },
  'tanpa-bukti': { icon: FileX, label: 'Tanpa bukti', tone: 'warn' },
  nonaktif: { icon: CircleSlash, label: 'Nonaktif', tone: 'neutral' },
  terlambat: { icon: Clock3, label: 'Terlambat', tone: 'warn' },
  'sangat-terlambat': { icon: ClockAlert, label: 'Sangat Terlambat', tone: 'danger' },
  konfidensial: { icon: Lock, label: 'Konfidensial', tone: 'konfidensial' },
  'belum-relevan': { icon: CircleMinus, label: 'Belum relevan', tone: 'neutral' },
  'tidak-dinilai': { icon: Ban, label: 'Tidak dinilai Lini 1', tone: 'neutral' },
  langkah: { icon: CheckCheck, label: 'Langkah', tone: 'info' },
};

/**
 * MarkerBadge_* (.pen kfF7i … VFP8a). `label` carries dynamic text such as
 * "Nonaktif sejak TW II" or "Tidak dinilai Direktorat Kepatuhan".
 */
export function MarkerBadge({ kind, label }: { kind: MarkerKind; label?: string }) {
  const { icon: Icon, label: fallback, tone } = MARKER[kind];
  return (
    <span className={`chip chip--badge chip--tone-${tone}`}>
      <Icon aria-hidden />
      {label ?? fallback}
    </span>
  );
}

/** Avatar (.pen FcH0W): 32 px initials circle. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.375 }}
      title={name}
      aria-hidden
    >
      {toInitials(name)}
    </span>
  );
}

export interface AttachmentFileChipProps {
  name: string;
  meta: string;
  confidential?: boolean;
  href?: string;
}

/** AttachmentChip_File (.pen b3BSy). */
export function AttachmentFileChip({ name, meta, confidential, href }: AttachmentFileChipProps) {
  const body = (
    <>
      <span className="attachment__icon" aria-hidden>
        <FileText />
      </span>
      <span className="attachment__text">
        <span className="attachment__name">{name}</span>
        <span className="attachment__meta">{meta}</span>
      </span>
      {confidential && <Lock className="attachment__lock" aria-label="Konfidensial" />}
    </>
  );
  return href ? (
    <a className="attachment attachment--file" href={href} download={name}>
      {body}
    </a>
  ) : (
    <span className="attachment attachment--file">{body}</span>
  );
}

/** AttachmentChip_Image (.pen g2ti7): 64 px thumbnail + mono filename. */
export function AttachmentImageChip({ name, src }: { name: string; src?: string }) {
  return (
    <span className="attachment attachment--image">
      {src ? (
        <img className="attachment__thumb" src={src} alt={name} />
      ) : (
        <span className="attachment__thumb attachment__thumb--placeholder" aria-hidden />
      )}
      <span className="attachment__thumb-name">{name}</span>
    </span>
  );
}

/** AttachmentChip_ConfidentialMasked (.pen bImUR): VIS-3 count without filenames. */
export function ConfidentialAttachmentsChip({ count }: { count: number }) {
  return (
    <span className="attachment attachment--masked">
      <Lock aria-hidden />
      {count} lampiran konfidensial
    </span>
  );
}
