import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { devApi } from './data/http/dev';
import legacyIds from './data/http/legacy-ids.json';
import { applyTheme, getTheme } from './lib/theme';
import { useMe } from './state/me';
import './styles/base.css';
import './styles/print.css';

applyTheme(getTheme());

/**
 * Demo links (development backend only): `?sebagai=usr-andi` signs in as that persona (prototype
 * persona ids map to the demo users' ids), `&waktu=YYYY-MM-DDTHH:mm` moves the server clock, and
 * `&data=sesuai` also rolls the demo data back to that moment.
 */
async function applyDemoLink() {
  const params = new URLSearchParams(window.location.search);
  const at = params.get('waktu');
  const validAt = at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? at : null;
  const persona = params.get('sebagai');
  try {
    if (validAt && params.get('data') === 'sesuai') await devApi.reset(validAt);
    if (validAt) await devApi.setClock(validAt);
    if (persona) {
      const id = (legacyIds as Record<string, string>)[persona] ?? persona;
      const { personas } = await devApi.personas();
      const nip = personas.find((p) => p.userId === id && p.active)?.nip;
      if (nip) await devApi.impersonate(nip);
    }
  } catch {
    // Without dev tools the backend refuses demo links; the app still starts.
  }
}

async function start() {
  await applyDemoLink();
  await useMe.getState().refresh();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
