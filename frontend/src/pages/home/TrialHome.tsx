import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, PageHeader } from '@/components';
import { pathVisible } from '@/data/http/migrated';
import { navFor } from '@/layout/nav';
import { usePageMeta } from '@/layout/pageMeta';
import { useMe } from '@/state/me';
import { useAuth } from '@/state/useAuth';
import './Home.css';

/**
 * Temporary Beranda of the trial build (spec §4.10, B4s): only the user's positions and the pages
 * of modules already on the backend — no cards computed from local demo data. Replaced by the
 * full Beranda when it moves (B6).
 */
export default function TrialHome() {
  usePageMeta(['Beranda']);
  const auth = useAuth();
  const holdings = useMe((s) => s.me?.holdings ?? []);
  const year = auth.currentQuarter?.fiscalYear ?? auth.currentFiscalYear;
  const pages = navFor(auth.roleView, auth)
    .flatMap((s) => s.items)
    .filter((i) => i.to !== '/' && pathVisible(i.to));
  return (
    <div className="home">
      <PageHeader eyebrow="Beranda" title={`Selamat datang, ${auth.user.fullName}`} />
      {holdings.length > 0 && (
        <Card title="Jabatan Anda">
          <ul className="home__list">
            {holdings.map((h) => (
              <li key={h.id}>
                <strong>{h.position.name}</strong>{' '}
                <span className="t-caption">
                  {h.capacity === 'pejabat' ? 'Pejabat' : 'Operator'} · Lini {h.line}
                </span>
                {h.line === 1 && (
                  <span className="home__links">
                    <Link className="text-link" to={`/jabatan/${h.positionId}/papan/${year}`}>
                      Papan Risiko
                    </Link>{' '}
                    <Link className="text-link" to={`/jabatan/${h.positionId}/register/${year}`}>
                      Register
                    </Link>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {pages.length > 0 && (
        <Card title="Halaman">
          <ul className="home__list">
            {pages.map((p) => (
              <li key={p.to}>
                <Link className="text-link" to={p.to}>
                  {p.label} <ArrowRight aria-hidden size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
