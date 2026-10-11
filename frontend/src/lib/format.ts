// Indonesian formatting helpers (design system §3: decimal comma, mono numbers).

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/** 3.2 → "3,2"; null/undefined → "—". Scores always carry one decimal. */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return '—';
  return score.toFixed(1).replace('.', ',');
}

/** Parses "3,2" or "3.2" into 3.2. Returns null for anything that is not a 0,0–4,0 score with one decimal. */
export function parseScore(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d(\.\d)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return value >= 0 && value <= 4 ? value : null;
}

/** ISO date (YYYY-MM-DD or full ISO) → "6 Apr 2027". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const MONTHS_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** ISO date → "Selasa, 6 April 2027". */
export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${weekday}, ${d} ${MONTHS_LONG[m! - 1]} ${y}`;
}

/** "x menit lalu" style relative time against the simulated now. */
export function formatRelative(iso: string, nowIso: string): string {
  const diff =
    (new Date(`${nowIso.slice(0, 16)}:00Z`).getTime() -
      new Date(`${iso.slice(0, 16)}:00Z`).getTime()) /
    60_000;
  if (diff < 1) return 'baru saja';
  if (diff < 60) return `${Math.floor(diff)} menit lalu`;
  if (diff < 24 * 60) return `${Math.floor(diff / 60)} jam lalu`;
  if (diff < 48 * 60) return 'kemarin';
  if (diff < 7 * 24 * 60) return `${Math.floor(diff / (24 * 60))} hari lalu`;
  return formatDate(iso);
}

/** ISO datetime → "6 Apr 2027 09.41" (Indonesian time separator). */
export function formatDateTime(iso: string): string {
  const time = iso.slice(11, 16).replace(':', '.');
  return `${formatDate(iso)} ${time}`;
}

/** 4250000000 → "Rp 4.250.000.000". */
export function formatRupiah(amount: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(amount)}`;
}

/** 1258291 → "1,2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** "Andi Wirawan" → "AW". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
