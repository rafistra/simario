import { House, Repeat, RotateCw, SearchX, ServerCrash, ShieldX, WifiOff } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@/components';
import { usePageMeta } from '@/layout/pageMeta';
import './FaultPages.css';

function Fault({ code, children }: { code: string; children: ReactNode }) {
  return (
    <div className="fault">
      <p className="t-eyebrow">{code}</p>
      {children}
    </div>
  );
}

/** 403 — never reveals whether the entity exists (UXStates frame zB8DR). */
export function ForbiddenPage() {
  const navigate = useNavigate();
  usePageMeta(['Tanpa akses']);
  return (
    <Fault code="403 · Tanpa akses">
      <EmptyState
        icon={ShieldX}
        title="Anda tidak memiliki akses ke halaman ini"
        message="Halaman ini memerlukan izin yang tidak dimiliki jabatan aktif Anda. Bila Anda memerlukannya, hubungi Superadmin unit Anda."
        action={
          <>
            <Button icon={House} onClick={() => navigate('/')}>
              Kembali ke Beranda
            </Button>
            <Button variant="secondary" icon={Repeat} onClick={() => navigate('/jabatan-saya')}>
              Ganti Jabatan
            </Button>
          </>
        }
      />
    </Fault>
  );
}

/** 404 — unknown route or id (frame uYxFQ). */
export function NotFoundPage() {
  const navigate = useNavigate();
  usePageMeta(['Halaman tidak ditemukan']);
  return (
    <Fault code="404 · Tidak ditemukan">
      <EmptyState
        icon={SearchX}
        title="Halaman tidak ditemukan"
        message="Alamat yang Anda buka tidak ada atau sudah dipindahkan. Periksa tautan, atau kembali ke Beranda."
        action={
          <Button icon={House} onClick={() => navigate('/')}>
            Kembali ke Beranda
          </Button>
        }
      />
    </Fault>
  );
}

/** 500 — unhandled error on a full page load (frame VvKZc). */
export function ServerErrorPage({
  reference,
  onRetry,
}: {
  reference: string;
  onRetry: () => void;
}) {
  return (
    <Fault code="500 · Galat server">
      <EmptyState
        icon={ServerCrash}
        title="Terjadi kesalahan pada server"
        message={`Permintaan Anda tidak dapat diproses. Draf yang sudah tersimpan tetap aman. Bila berulang, hubungi Superadmin dengan kode rujukan ${reference}.`}
        action={
          <>
            <Button icon={RotateCw} onClick={onRetry}>
              Coba Lagi
            </Button>
            <Button variant="secondary" icon={House} onClick={() => window.location.assign('/')}>
              Kembali ke Beranda
            </Button>
          </>
        }
      />
    </Fault>
  );
}

/** Full-page offline state for data that could not load (frame VGYdp). */
export function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <Fault code="Luring">
      <EmptyState
        icon={WifiOff}
        title="Tidak ada koneksi internet"
        message="Halaman ini tidak dapat dimuat. Periksa jaringan Anda, lalu coba lagi."
        action={
          <Button icon={RotateCw} onClick={onRetry}>
            Coba Lagi
          </Button>
        }
      />
    </Fault>
  );
}

/** Renders the 500 page for render-time crashes instead of a blank screen. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { reference: string | null }
> {
  state = { reference: null as string | null };

  static getDerivedStateFromError() {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    return { reference: `ERR-${stamp}` };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SIMARIO render error', error, info.componentStack);
  }

  render() {
    if (this.state.reference)
      return (
        <ServerErrorPage
          reference={this.state.reference}
          onRetry={() => this.setState({ reference: null })}
        />
      );
    return this.props.children;
  }
}
