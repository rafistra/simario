import { ChevronDown, ChevronUp, LogIn, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, CapacityChip, InlineAlert, LineChip, TextInput } from '@/components';
import { authApi, type SsoOutcome } from '@/data/repository';
import { useDb } from '@/data/local/store';
import { staffDirectory } from '@/data/seed';
import { holdingsOf } from '@/domain/rules/access';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { today } from '@/state/clock';
import { useMaybeAuth } from '@/state/useAuth';
import { AuthLayout } from './AuthLayout';

/** Prototype stand-in for the Keycloak screen: choosing an account = signing in with it. */
function SsoPicker({ onPick, onClose }: { onPick: (nip: string) => void; onClose: () => void }) {
  const db = useDb((s) => s.db);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  const day = today();
  const describe = (userId: string) => {
    const holdings = holdingsOf(db, userId, day);
    const roles = db.userRoles
      .filter((r) => r.userId === userId)
      .map((r) => db.roles.find((x) => x.id === r.roleId)!.name);
    return { holdings, roles };
  };
  const users = [...db.users].sort((a, b) => {
    const la = describe(a.id).holdings[0]?.line ?? 9;
    const lb = describe(b.id).holdings[0]?.line ?? 9;
    return la - lb || a.fullName.localeCompare(b.fullName);
  });
  const unregistered = staffDirectory[0]!;
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
            <p className="t-eyebrow">Simulasi SSO Otorita IKN</p>
            <h2 id="sso-title" className="t-display-sm">
              Pilih akun
            </h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <p className="sso-picker__note">
          Prototipe ini tidak terhubung ke Keycloak. Memilih akun di bawah sama dengan masuk dengan
          akun tersebut; pencocokan memakai NIP.
        </p>
        <ul className="sso-picker__list">
          {users.map((u) => {
            const { holdings, roles } = describe(u.id);
            return (
              <li key={u.id}>
                <button type="button" className="sso-picker__item" onClick={() => onPick(u.nip)}>
                  <span className="sso-picker__name">
                    {u.fullName}
                    {!u.active && <span className="sso-picker__tag">Nonaktif</span>}
                  </span>
                  <span className="sso-picker__meta">
                    {holdings.map((h) => {
                      const p = db.positions.find((x) => x.id === h.positionId)!;
                      return (
                        <span key={h.id} className="sso-picker__holding">
                          <LineChip line={h.line} />
                          <CapacityChip capacity={h.capacity} />
                          {p.name}
                        </span>
                      );
                    })}
                    {roles.map((r) => (
                      <span key={r} className="sso-picker__holding">
                        {r}
                      </span>
                    ))}
                    {holdings.length === 0 && roles.length === 0 && (
                      <span className="sso-picker__holding">Tanpa jabatan aktif</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className="sso-picker__item"
              onClick={() => onPick(unregistered.nip)}
            >
              <span className="sso-picker__name">
                {unregistered.fullName}
                <span className="sso-picker__tag">Belum terdaftar</span>
              </span>
              <span className="sso-picker__meta">Ada di Keycloak, belum ada di SIMARIO</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const auth = useMaybeAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [picker, setPicker] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [busy, setBusy] = useState<'sso' | 'local' | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [nip, setNip] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ nip?: string; password?: string }>({});
  const nipRef = useRef<HTMLInputElement>(null);
  const expired = params.get('alasan') === 'sesi-berakhir';

  if (auth && !busy)
    return <Navigate to={auth.user.mustChangePassword ? '/ganti-kata-sandi' : '/'} replace />;

  const finish = (outcome: SsoOutcome, kind: 'sso' | 'local') => {
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
    const kembali = params.get('kembali');
    navigate(kembali && kembali.startsWith('/') ? kembali : '/', { replace: true });
  };

  const sso = async (pickedNip: string) => {
    setPicker(false);
    setBusy('sso');
    setError(null);
    try {
      finish(await authApi.signInSso(pickedNip), 'sso');
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
      finish(await authApi.signInLocal(nip, password), 'local');
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
          onClick={() => setPicker(true)}
        >
          Masuk dengan Akun Otorita IKN
        </Button>
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
      {picker && <SsoPicker onPick={sso} onClose={() => setPicker(false)} />}
    </AuthLayout>
  );
}
