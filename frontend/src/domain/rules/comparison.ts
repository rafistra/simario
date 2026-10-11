// Comparison result for one Lini 3 position — PRD FR-NIL-007, FR-NIL-008, RB-NIL-003, RB-NIL-006.

import { addWorkdays } from '../calendar';
import type { Assessment, ComparisonResult, ExplanationStatus, ISODateTime } from '../types';
import { PREDICATE_RANK } from '../types';

export interface ComparisonOutcome {
  result: ComparisonResult['result'];
  lini1Higher: boolean;
  explanationRequired: boolean;
  explanationStatus: ExplanationStatus;
}

/** Predicates are compared, not scores (RB-NIL-003). */
export function compareAssessments(
  lini1: Assessment | undefined,
  lini3: Assessment,
): ComparisonOutcome {
  const incomparable =
    !lini1 ||
    lini1.status === 'not_assessed' ||
    lini1.notRelevant ||
    !lini1.predicate ||
    !lini3.predicate;
  if (incomparable) {
    return {
      result: 'incomparable',
      lini1Higher: false,
      explanationRequired: false,
      explanationStatus: 'not_required',
    };
  }
  if (lini1.predicate === lini3.predicate) {
    return {
      result: 'sesuai',
      lini1Higher: false,
      explanationRequired: false,
      explanationStatus: 'not_required',
    };
  }
  const lini1Higher = PREDICATE_RANK[lini1.predicate!] > PREDICATE_RANK[lini3.predicate!];
  return {
    result: 'tidak_sesuai',
    lini1Higher,
    // Mandatory only when Lini 1 is more optimistic (RB-NIL-006); optional otherwise.
    explanationRequired: lini1Higher,
    explanationStatus: lini1Higher ? 'pending' : 'optional',
  };
}

/** Explanation deadline: opened_at + explanation_workdays, Monday–Friday (§2.5). */
export function explanationDueOn(openedAt: ISODateTime, workdays: number): string {
  return addWorkdays(openedAt.slice(0, 10), workdays);
}
