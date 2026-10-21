import { ChevronDown, ChevronUp, LogIn, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CapacityChip, InlineAlert, LineChip, TextInput } from '@/components';
import type { AuthConfig } from '@/data/http/auth';
import { authApi, type SsoOutcome } from '@/data/repository';
import { devApi } from '@/data/http/dev';
import { ROLE_VIEW_LABEL, type RoleViewCode } from '@/domain/permissions';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { useMe } from '@/state/me';
import { useMaybeAuth } from '@/state/useAuth';
import { AuthLayout } from './AuthLayout';

/** Development persona picker: signing in as a seed user by NIP (POST /dev/impersonate). */
function PersonaPicker({
  onPick,
  onClose,
}: {
  onPick: (nip: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const [data, setData] = useState<Awaited<ReturnType<typeof devApi.personas>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    devApi.personas().then(setData, (e: Error) => setError(e.message));
  }, []);
  const users = [...(data?.personas ?? [])].sort(
    (a, b) =>
      (a.holdings[0]?.line ?? 9) - (b.holdings[0]?.line ?? 9) ||
      a.fullName.localeCompare(b.fullName),
  );
  return (
    <div className="overlay overlay--center">
      <div className="overlay__scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sso-title"
        className="dialog sso-picker"
      >
        <header className="dialog__header">
          <div>
            <p className="t-eyebrow">Mode pengembangan</p>
            <h2 id="sso-title" className="t-display-sm">
              Pilih akun
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <p className="sso-picker__note">
          Masuk sebagai pengguna data contoh tanpa Keycloak. Pencocokan memakai NIP, sama seperti
          SSO.
        </p>
        {error && (
          <InlineAlert variant="error" title="Daftar akun tidak dapat dimuat">
            {error}
          </InlineAlert>
        )}
        <ul className="sso-picker__list">
          {users.map((u) => (
            <li key={u.userId}>
              <button type="button" className="sso-picker__item" onClick={() => onPick(u.nip)}>
                <span className="sso-picker__name">
                  {u.fullName}
                  {!u.active && <span className="sso-picker__tag">Nonaktif</span>}
                </span>
                <span className="sso-picker__meta">
                  {u.holdings.map((h) => (
                    <span key={h.positionName + h.capacity} className="sso-picker__holding">
                      <LineChip line={h.line} />
                      <CapacityChip capacity={h.capacity} />
                      {h.positionName}
                    </span>
                  ))}
                  {u.holdings.length === 0 &&
                    (u.roleViews.length ? (
                      u.roleViews.map((v) => (
                        <span key={v} className="sso-picker__holding">
                          {ROLE_VIEW_LABEL[v as RoleViewCode] ?? v}
                        </span>
                      ))
                    ) : (
                      <span className="sso-picker__holding">Tanpa jabatan aktif</span>
                    ))}
                </span>
              </button>
            </li>
          ))}
          {data && (
            <li>
              <button
                type="button"
                className="sso-picker__item"
                onClick={() => onPick(data.unregistered.nip)}
              >
                <span className="sso-picker__name">
                  {data.unregistered.fullName}
                  <span className="sso-picker__tag">Belum terdaftar</span>
                </span>
                <span className="sso-picker__meta">Ada di Keycloak, belum ada di SIMARIO</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

const UNREGISTERED =
  'Akun Anda belum terdaftar di SIMARIO. Hubungi Superadmin, atau minta pejabat yang Anda bantu menunjuk Anda sebagai operator.';

/** Messages for /login?alasan=… set by the SSO callback (FR-AUT-001) and the idle timeout. */
const REASONS: Record<string, { title: string; message: string }> = {
  'belum-terdaftar': { title: 'Akun belum terdaftar', message: UNREGISTERED },
  'tidak-aktif': {
    title: 'Tidak dapat masuk',
    message: 'Akun Anda tidak aktif. Hubungi Superadmin.',
  },
  'sso-gagal': {
    title: 'Tidak dapat masuk',
    message: 'Masuk dengan SSO gagal. Silakan coba lagi.',
  },
};

export default function LoginPage() {
  const auth = useMaybeAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [picker, setPicker] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [busy, setBusy] = useState<'sso' | 'local' | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(
    () => REASONS[params.get('alasan') ?? ''] ?? null,
  );
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    authApi.config().then(setConfig, () => setConfig(null));
  }, []);
  const kembaliParam = params.get('kembali');
  const kembali = kembaliParam && kembaliParam.startsWith('/') ? kembaliParam : '/';
  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ nip?: string; password?: string }>({});
  const nipRef = useRef<HTMLInputElement>(null);
  const expired = params.get('alasan') === 'sesi-berakhir';

  if (auth && !busy)
    return <Navigate to={auth.user.mustChangePassword ? '/ganti-kata-sandi' : '/'} replace />;

  const finish = async (outcome: SsoOutcome, kind: 'sso' | 'local') => {
    if (outcome.ok) await useMe.getState().refresh();
    setBusy(null);
    if (!outcome.ok) {
      const unregistered = outcome.message.startsWith('Akun Anda belum terdaftar');
      setError({
        title: unregistered
          ? 'Akun belum terdaftar'
          : kind === 'local'
            ? 'NIP atau kata sandi tidak sesuai'
            : 'Tidak dapat masuk',
        message: unregistered
          ? outcome.message
          : kind === 'local' && outcome.message === 'NIP atau kata sandi tidak sesuai'
            ? 'Periksa kembali NIP dan kata sandi akun lokal Anda.'
            : outcome.message,
      });
      if (kind === 'local') nipRef.current?.focus();
      return;
    }
    navigate(kembali, { replace: true });
  };

  const sso = async (pickedNip: string) => {
    setPicker(false);
    setBusy('sso');
    setError(null);
    try {
      await finish(await authApi.signInSso(pickedNip), 'sso');
    } catch (e) {
      setBusy(null);
      setError({ title: 'Tidak dapat masuk', message: (e as Error).message });
    }
  };

  const local = async (e: FormEvent) => {
    e.preventDefault();
    const errs = {
      nip: nip.trim() ? undefined : 'NIP wajib diisi.',
      password: password ? undefined : 'Kata sandi wajib diisi.',
    };
    setFieldErrors(errs);
    if (errs.nip || errs.password) return;
    setBusy('local');
    setError(null);
    try {
      await finish(await authApi.signInLocal(nip, password), 'local');
    } catch (err) {
      setBusy(null);
      setError({ title: 'Tidak dapat masuk', message: (err as Error).message });
    }
  };

  return (
    <AuthLayout help="Kendala masuk? Hubungi Superadmin unit Anda.">
      {expired && (
        <InlineAlert variant="info" title="Sesi Anda berakhir. Silakan masuk kembali.">
          Anda tidak aktif selama 60 menit. Draf Anda sudah tersimpan otomatis.
        </InlineAlert>
      )}
      <Card eyebrow="Masuk" title="Gunakan akun Otorita IKN Anda" className="auth__card">
        {error && (
          <InlineAlert variant="error" title={error.title}>
            {error.message}
          </InlineAlert>
        )}
        <Button
          icon={LogIn}
          fullWidth
          className="auth__sso"
          loading={busy === 'sso'}
          loadingLabel="Mengalihkan…"
          onClick={() => {
            setBusy('sso');
            authApi.startSso(kembali);
          }}
        >
          Masuk dengan Akun Otorita IKN
        </Button>
        {config?.devTools && (
          <button type="button" className="auth__toggle" onClick={() => setPicker(true)}>
            Masuk sebagai persona (mode pengembangan)
          </button>
        )}
        <div className="auth__divider">
          <span>atau</span>
        </div>
        <button
          type="button"
          className="auth__toggle"
          aria-expanded={localOpen}
          aria-controls="local-form"
          onClick={() => setLocalOpen((o) => !o)}
        >
          Masuk dengan akun lokal
          {localOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </button>
        {localOpen && (
          <form id="local-form" className="auth__form" onSubmit={local} noValidate>
            <TextInput
              ref={nipRef}
              label="NIP"
              inputMode="numeric"
              autoComplete="username"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              error={fieldErrors.nip}
            />
            <TextInput
              label="Kata sandi"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />
            <Button type="submit" fullWidth loading={busy === 'local'} loadingLabel="Memeriksa…">
              Masuk
            </Button>
          </form>
        )}
      </Card>
      {picker && <PersonaPicker onPick={sso} onClose={() => setPicker(false)} />}
    </AuthLayout>
  );
}
