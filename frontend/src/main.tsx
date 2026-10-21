import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { devApi } from './data/http/dev';
import { getDb, useDb } from './data/local/store';
import { runScheduledTasks } from './data/local/scheduler';
import { applyTheme, getTheme } from './lib/theme';
import { useClock } from './state/clock';
import { useMe } from './state/me';
import './styles/base.css';
import './styles/print.css';

applyTheme(getTheme());

/**
 * Demo links (development backend only): `?sebagai=usr-andi` signs in as that persona,
 * `&waktu=YYYY-MM-DDTHH:mm` moves the simulated clock, `&data=sesuai` also rolls the sample data
 * back to that moment. Each acts on the backend (dev endpoints) and on the local store that the
 * not-yet-migrated namespaces still use.
 */
async function applyDemoLink() {
  const params = new URLSearchParams(window.location.search);
  const at = params.get('waktu');
  const validAt = at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? at : null;
  const persona = params.get('sebagai');
  const nip = persona && getDb().users.find((u) => u.id === persona && u.active)?.nip;
  try {
    if (validAt && params.get('data') === 'sesuai') {
      await devApi.reset(validAt);
      useDb.getState().reset(validAt);
    }
    if (validAt) {
      useClock.getState().setNow(validAt);
      await devApi.setClock(validAt);
    }
    if (nip) await devApi.impersonate(nip);
  } catch {
    // Without dev tools the backend ignores demo links; the app still starts.
  }
}

async function start() {
  await applyDemoLink();
  // Scheduled tasks of the local namespaces run at start-up and whenever the clock moves.
  runScheduledTasks();
  useClock.subscribe(() => runScheduledTasks());
  await useMe.getState().refresh();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
