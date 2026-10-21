// Pure derivations of the admin pages, moved out of the prototype module (B9) so pages do
// not bundle the local store. The fake backend re-exports them.

import type { DB } from '@/test/fake/db';

const activeOn = (start: string, end: string | null, day: string) =>
  start <= day && (end === null || end >= day);
const posName = (d: DB, id: string) => d.positions.find((p) => p.id === id)?.name ?? id;
const activeDelegatesOfOccupancy = (d: DB, occId: string, day: string) =>
  d.delegates.filter(
    (x) => x.appointedByOccupancyId === occId && activeOn(x.startDate, x.endDate, day),
  );

function multi(d: DB, positionId: string) {
  const p = d.positions.find((x) => x.id === positionId)!;
  return !!d.positionTypes.find((t) => t.id === p.positionTypeId)?.allowsMultipleOfficials;
}

/** What deactivating a user would end (dialog consequences, FR-ADM-004). */
export function deactivationImpact(db: DB, userId: string, today: string) {
  const occ = db.occupancies.filter(
    (o) => o.userId === userId && activeOn(o.startDate, o.endDate, today),
  );
  const dels = db.delegates.filter(
    (x) => x.userId === userId && activeOn(x.startDate, x.endDate, today),
  );
  const appointed = occ.flatMap((o) => activeDelegatesOfOccupancy(db, o.id, today));
  const fillerBlock = occ.find(
    (o) =>
      o.isFiller &&
      multi(db, o.positionId) &&
      db.occupancies.some(
        (x) =>
          x.positionId === o.positionId && x.id !== o.id && activeOn(x.startDate, x.endDate, today),
      ),
  );
  return {
    occupancies: occ.length,
    delegations: dels.length,
    appointedOperators: appointed.length,
    fillerBlock: fillerBlock ? posName(db, fillerBlock.positionId) : null,
  };
}
