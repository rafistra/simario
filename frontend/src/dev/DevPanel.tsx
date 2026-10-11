import { FlaskConical, MessageSquarePlus, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, ConfirmDialog, Select, Toggle, toast } from '@/components';
import { authApi } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { formatDateTime } from '@/lib/format';
import { applyTheme, getTheme, type Theme } from '@/lib/theme';
import { DEFAULT_NOW, useClock, useNow } from '@/state/clock';
import { useDevSettings } from '@/state/devSettings';
import { useSession } from '@/state/session';
import { simulateIncomingComment } from './simulate';
import './DevPanel.css';

const PRESETS: { label: string; at: string }[] = [
  { label: '11 Jan 2027 — Beranda awal tahun', at: '2027-01-11T09:00' },
  { label: '18 Mar 2027 — jendela Lini 1 TW I', at: '2027-03-18T09:00' },
  { label: '22 Mar 2027 — fase buta TW I', at: '2027-03-22T09:00' },
  { label: '6 Apr 2027 — hasil TW I dibuka (bawaan)', at: DEFAULT_NOW },
  { label: '20 Jul 2027 — riwayat TW II', at: '2027-07-20T09:00' },
  { label: '12 Okt 2027 — administrasi', at: '2027-10-12T09:00' },
];

/** Prototype controls (CLAUDE.md §5): persona, simulated date, latency, failures, offline, reset. */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const threadRisk = /\/risiko\/([^/?#]+)/.exec(useLocation().pathname)?.[1];
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, () => setOpen(false));
  const navigate = useNavigate();
  const users = useDb((s) => s.db.users);
  const reset = useDb((s) => s.reset);
  const userId = useSession((s) => s.userId);
  const setNow = useClock((s) => s.setNow);
  const now = useNow(10_000);
  const dev = useDevSettings();

  const signInAs = async (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    authApi.signOut();
    const outcome = await authApi.signInSso(user.nip);
    if (!outcome.ok) toast.error('Tidak dapat masuk', outcome.message);
    navigate('/');
  };

  return (
    <>
      <button
        type="button"
        className="dev-fab"
        onClick={() => setOpen(true)}
        aria-label="Buka panel prototipe"
      >
        <FlaskConical aria-hidden />
        <span>Prototipe</span>
      </button>
      {open && (
        <div className="overlay overlay--right">
          <div className="overlay__scrim" onClick={() => setOpen(false)} aria-hidden />
          <div
            ref={ref}
            className="slide-over dev-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dev-title"
          >
            <header className="slide-over__header">
              <div className="slide-over__titles">
                <p className="t-eyebrow">Hanya prototipe</p>
                <h2 id="dev-title" className="t-display-sm">
                  Panel prototipe
                </h2>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Tutup"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden />
              </button>
            </header>
            <div className="slide-over__body">
              <section className="dev-panel__section">
                <Select
                  label="Masuk sebagai"
                  value={userId ?? ''}
                  placeholder="Pilih persona"
                  options={users
                    .filter((u) => u.active)
                    .map((u) => ({ value: u.id, label: u.fullName }))}
                  onChange={(e) => signInAs(e.target.value)}
                />
              </section>

              <section className="dev-panel__section">
                <p className="t-eyebrow">Tanggal simulasi</p>
                <p className="dev-panel__now t-mono">{formatDateTime(now)} WITA</p>
                <label className="field">
                  <span className="field__label">Ubah ke</span>
                  <input
                    type="datetime-local"
                    className="control control--date"
                    value={now}
                    onChange={(e) => e.target.value && setNow(e.target.value)}
                  />
                </label>
                <div className="dev-panel__presets">
                  {PRESETS.map((p) => (
                    <button
                      key={p.at}
                      type="button"
                      className="dev-panel__preset"
                      onClick={() => setNow(p.at)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="dev-panel__section">
                <p className="t-eyebrow">Jaringan & sesi</p>
                <Toggle
                  label="Latensi simulasi (150–400 ms)"
                  checked={dev.latency}
                  onChange={(v) => dev.set({ latency: v })}
                />
                <Toggle
                  label="Simulasi luring"
                  checked={dev.offline}
                  onChange={(v) => dev.set({ offline: v })}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    dev.set({ failNext: true });
                    toast.success(
                      'Panggilan berikutnya akan gagal',
                      'Gunakan untuk melihat keadaan galat dan "Coba Lagi".',
                    );
                  }}
                >
                  Gagalkan panggilan berikutnya
                </Button>
                <Select
                  label="Sesi berakhir setelah tidak aktif"
                  value={String(dev.idleMinutes)}
                  options={[
                    { value: '1', label: '1 menit (uji)' },
                    { value: '5', label: '5 menit' },
                    { value: '60', label: '60 menit (PRD)' },
                  ]}
                  onChange={(e) => dev.set({ idleMinutes: Number(e.target.value) })}
                />
              </section>

              <section className="dev-panel__section">
                <p className="t-eyebrow">Tampilan & data</p>
                <Button
                  variant="secondary"
                  icon={theme === 'light' ? Moon : Sun}
                  onClick={() => {
                    const next = theme === 'light' ? 'dark' : 'light';
                    applyTheme(next);
                    setThemeState(next);
                  }}
                >
                  {theme === 'light' ? 'Mode gelap' : 'Mode terang'}
                </Button>
                {threadRisk && (
                  <Button
                    variant="secondary"
                    icon={MessageSquarePlus}
                    onClick={() => {
                      const name = simulateIncomingComment(
                        threadRisk,
                        useSession.getState().userId ?? '',
                      );
                      if (name)
                        toast.success(
                          'Komentar masuk disimulasikan',
                          `${name} mengirim komentar di utas ini.`,
                        );
                    }}
                  >
                    Simulasikan komentar masuk
                  </Button>
                )}
                <Button
                  variant="destructive"
                  icon={RotateCcw}
                  onClick={() => setConfirmReset(true)}
                >
                  Atur ulang data contoh
                </Button>
              </section>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        destructive
        title="Atur ulang data contoh?"
        confirmLabel="Atur Ulang Data"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          reset();
          setConfirmReset(false);
          toast.success('Data contoh dipulihkan', 'Semua perubahan di browser ini dihapus.');
        }}
      >
        Semua perubahan yang Anda buat di browser ini akan hilang dan data kembali seperti awal.
      </ConfirmDialog>
    </>
  );
}
