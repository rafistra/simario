// Visibility rules — PRD §2.7 (VIS-1 … VIS-9), INV-16, INV-17. Applied in data selectors, never
// only in JSX (CLAUDE.md §6). These functions decide; callers filter what they return.

import type { DB } from '@/test/fake/db';
import type { Assessment, Attachment, ComparisonResult, ISODate, RiskQuarter } from '../types';
import { hasPermission, holdingsOf } from './access';

export interface Viewer {
  userId: string;
  /** Positions the viewer holds (any capacity) on `today`. */
  heldPositionIds: string[];
  /** Lini 3 positions held — their own results gate what they see (VIS-1, VIS-5, VIS-9). */
  lini3PositionIds: string[];
  canSeeConfidential: boolean;
  /** Permission 24 *and* an explicit, audit-logged blind view for this context (FR-NIL-012). */
  blindViewGranted: boolean;
}

export function viewerFor(
  db: DB,
  userId: string,
  today: ISODate,
  blindViewGranted = false,
): Viewer {
  const holdings = holdingsOf(db, userId, today);
  return {
    userId,
    heldPositionIds: holdings.map((h) => h.positionId),
    lini3PositionIds: holdings.filter((h) => h.line === 3).map((h) => h.positionId),
    canSeeConfidential: hasPermission(db, userId, 10, today),
    blindViewGranted: blindViewGranted && hasPermission(db, userId, 24, today),
  };
}

/** Lini 3 positions whose result for this risk-quarter has opened. */
export function openedLini3(results: ComparisonResult[], riskQuarterId: string): Set<string> {
  return new Set(
    results.filter((r) => r.riskQuarterId === riskQuarterId).map((r) => r.lini3PositionId),
  );
}

/**
 * VIS-9: a Lini 3 viewer is "late" for a risk-quarter while any Lini 3 position they hold that
 * assesses it has not yet had its own result opened. Such a viewer sees no other assessment,
 * result, explanation, or derived marker for it.
 */
export function isLateDirectorate(
  viewer: Viewer,
  opened: Set<string>,
  expected: string[],
): boolean {
  return viewer.lini3PositionIds.some((p) => expected.includes(p) && !opened.has(p));
}

/** Score, predicate, note, and assessment attachments of one assessment (VIS-1, VIS-2, VIS-5, VIS-9). */
export function canSeeAssessment(
  viewer: Viewer,
  assessment: Assessment,
  opened: Set<string>,
  expectedLini3: string[],
): boolean {
  if (viewer.heldPositionIds.includes(assessment.assessorPositionId)) return true;
  if (viewer.blindViewGranted) return true;
  if (isLateDirectorate(viewer, opened, expectedLini3)) return false;
  if (assessment.assessorLine === 3) return opened.has(assessment.assessorPositionId);
  // Lini 1 assessment: visible once any result for the risk-quarter has opened (VIS-2).
  return opened.size > 0;
}

export function canSeeResult(
  viewer: Viewer,
  opened: Set<string>,
  expectedLini3: string[],
): boolean {
  if (viewer.blindViewGranted) return true;
  return !isLateDirectorate(viewer, opened, expectedLini3);
}

/** VIS-3 / INV-17: confidential attachments only with permission 10. */
export function canSeeAttachment(viewer: Viewer, attachment: Attachment): boolean {
  if (attachment.scanStatus !== 'clean' && attachment.uploadedById !== viewer.userId) return false; // INV-10
  return !attachment.isConfidential || viewer.canSeeConfidential;
}

/** Convenience: assessments of a risk-quarter the viewer may see. */
export function visibleAssessments(
  viewer: Viewer,
  rq: RiskQuarter,
  assessments: Assessment[],
  results: ComparisonResult[],
  expectedLini3: string[],
): Assessment[] {
  const opened = openedLini3(results, rq.id);
  return assessments
    .filter((a) => a.riskQuarterId === rq.id)
    .filter((a) => canSeeAssessment(viewer, a, opened, expectedLini3));
}

export const REDACTED = '[disamarkan]';
export const REDACTED_FILE = '[konfidensial]';
