import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getDb, useDb } from './data/local/store';
import { runScheduledTasks } from './data/local/scheduler';
import { applyTheme, getTheme } from './lib/theme';
import { useClock } from './state/clock';
import { useSession } from './state/session';
import './styles/base.css';
import './styles/print.css';

applyTheme(getTheme());

// Prototype convenience: `?sebagai=usr-andi` signs in as that persona (demo links, screenshots).
const params = new URLSearchParams(window.location.search);
const persona = params.get('sebagai');
if (persona && getDb().users.some((u) => u.id === persona && u.active)) {
  useSession.getState().signIn(persona);
}
const at = params.get('waktu');
if (at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) {
  useClock.getState().setNow(at);
  // `&data=sesuai` also rolls the sample data back to that moment (scenario links).
  if (params.get('data') === 'sesuai') useDb.getState().reset(at);
}

// Scheduled tasks run at start-up and whenever the simulated clock moves.
runScheduledTasks();
useClock.subscribe(() => runScheduledTasks());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
