import type { ReactNode } from 'react';
import { ForbiddenPage } from '@/pages/faults/FaultPages';
import { useAuth } from '@/state/useAuth';

/** Renders 403 unless the user holds at least one of the permission codes (route access, §1.8). */
export function RequirePermission({ anyOf, children }: { anyOf: number[]; children: ReactNode }) {
  const auth = useAuth();
  return anyOf.some((c) => auth.can(c)) ? <>{children}</> : <ForbiddenPage />;
}

/** Pages for users holding a position (e.g. /jabatan-saya) or a Lini 2 position (/pantauan). */
export function RequireHolding({ line, children }: { line?: 1 | 2 | 3; children: ReactNode }) {
  const auth = useAuth();
  const ok = auth.holdings.some((h) => line === undefined || h.line === line);
  return ok ? <>{children}</> : <ForbiddenPage />;
}
