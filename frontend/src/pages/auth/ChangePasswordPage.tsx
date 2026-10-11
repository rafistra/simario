import { CircleCheck, CircleDashed, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Card, InlineAlert, PageHeader, TextInput, toast } from '@/components';
import { authApi } from '@/data/repository';
import { AppShell } from '@/layout/AppShell';
import { usePageMeta } from '@/layout/pageMeta';
import { useMaybeAuth } from '@/state/useAuth';
import { AuthLayout } from './AuthLayout';

function PasswordForm({ forced, onDone }: { forced: boolean; onDone: () => void }) {
  const auth = useMaybeAuth()!;
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqs = [
    { label: 'Minimal 12 karakter', ok: newPw.length >= 12 },
    {
      label: forced ? 'Berbeda dari kata sandi awal' : 'Berbeda dari kata sandi lama',
      ok: newPw.length > 0 && newPw !== (forced ? auth.user.password : oldPw),
    },
    { label: 'Kedua kata sandi sama', ok: repeat.length > 0 && repeat === newPw },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    // "Simpan" is never disabled: pressing it with unmet requirements marks the fields (§2.4).
    if (reqs.some((r) => !r.ok) || (!forced && !oldPw)) return;
    setBusy(true);
    try {
      await authApi.changePassword(auth.user.id, {
        oldPassword: forced ? undefined : oldPw,
        newPassword: newPw,
      });
      toast.success('Kata sandi berhasil diubah');
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      {/* Lets password managers associate the new password with the account (NIP). */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={auth.user.nip}
        readOnly
        hidden
      />
      {error && <InlineAlert variant="error" title={error} />}
      {!forced && (
        <TextInput
          label="Kata sandi lama"
          type="password"
          autoComplete="current-password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          error={submitted && !oldPw ? 'Kata sandi lama wajib diisi.' : undefined}
        />
      )}
      <TextInput
        label="Kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        error={
          submitted && !(reqs[0]!.ok && reqs[1]!.ok)
            ? 'Kata sandi baru belum memenuhi syarat.'
            : undefined
        }
      />
      <TextInput
        label="Ulangi kata sandi baru"
        type="password"
        autoComplete="new-password"
        value={repeat}
        onChange={(e) => setRepeat(e.target.value)}
        error={submitted && !reqs[2]!.ok ? 'Kedua kata sandi belum sama.' : undefined}
      />
      <ul className="requirements" aria-live="polite">
        {reqs.map((r) => (
          <li key={r.label} className={r.ok ? 'is-ok' : undefined}>
            {r.ok ? <CircleCheck aria-hidden /> : <CircleDashed aria-hidden />}
            {r.label} — {r.ok ? 'terpenuhi' : 'belum'}
          </li>
        ))}
      </ul>
      <Button type="submit" icon={Save} fullWidth={forced} loading={busy}>
        Simpan
      </Button>
    </form>
  );
}

function SelfServiceContent() {
  const navigate = useNavigate();
  usePageMeta(['Ganti Kata Sandi']);
  return (
    <>
      <PageHeader
        eyebrow="Keamanan akun"
        title="Ganti Kata Sandi"
        subtitle="Hanya untuk akun lokal SIMARIO."
      />
      <Card className="password-card">
        <PasswordForm forced={false} onDone={() => navigate('/')} />
      </Card>
    </>
  );
}

/** /ganti-kata-sandi — forced (no sidebar, no exit) or self-service (FR-AUT-003, FR-AUT-004). */
export default function ChangePasswordPage() {
  const auth = useMaybeAuth();
  const navigate = useNavigate();
  if (!auth) return <Navigate to="/login" replace />;
  if (!auth.user.isLocalAccount) return <Navigate to="/" replace />;
  if (auth.user.mustChangePassword) {
    return (
      <AuthLayout help={`Masuk sebagai NIP ${auth.user.nip} · akun lokal`}>
        <Card eyebrow="Keamanan akun" title="Ganti Kata Sandi" className="auth__card">
          <InlineAlert variant="warning" title="Kata sandi awal harus diganti sebelum melanjutkan.">
            Akun lokal Anda masih memakai kata sandi awal dari Superadmin.
          </InlineAlert>
          <PasswordForm forced onDone={() => navigate('/', { replace: true })} />
        </Card>
      </AuthLayout>
    );
  }
  return (
    <AppShell>
      <SelfServiceContent />
    </AppShell>
  );
}
