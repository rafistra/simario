import '@testing-library/jest-dom/vitest';
import { getDb, useDb } from '@/data/local/store';
import { today, useClock } from '@/state/clock';
import { useMe } from '@/state/me';
import { useSession } from '@/state/session';
import { installFakeBackend } from './fakeBackend';
import { meFromLocal } from './meFromLocal';

// Tests sign in with useSession.signIn('usr-…') and mutate the local store directly; keep the
// /me context (normally fetched from the backend) in step with them.
const syncMe = () => {
  const userId = useSession.getState().userId;
  useMe.getState().set(userId ? meFromLocal(getDb(), userId, today()) : null);
};
useSession.subscribe(syncMe);
useDb.subscribe(syncMe);
useClock.subscribe(syncMe);
syncMe();

beforeEach(() => installFakeBackend());
