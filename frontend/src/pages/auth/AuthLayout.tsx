import { Landmark } from 'lucide-react';
import type { ReactNode } from 'react';
import './Auth.css';

/** Single centred column, max 400, no sidebar or topbar (PRD §3.3). */
export function AuthLayout({ children, help }: { children: ReactNode; help?: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth__column">
        <div className="auth__brand">
          <span className="auth__logo" aria-hidden>
            <Landmark />
          </span>
          <h1 className="auth__title">SIMARIO</h1>
          <p className="auth__subtitle">Sistem Informasi Mitigasi Risiko Otorita IKN</p>
        </div>
        {children}
        {help && <p className="auth__help">{help}</p>}
      </div>
      <p className="auth__footer">Otorita Ibu Kota Nusantara · DDKB</p>
    </main>
  );
}
