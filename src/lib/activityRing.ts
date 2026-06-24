// =============================================================================
// Activity Status Ring — presentation mapping (Workflow 4 stretch s10).
// =============================================================================
// Pure, deterministic mapping from a member's `ActivityStatus` (already derived
// by `deriveActivityStatus` in @/lib/scoring) to the secondary "activity ring"
// shown on canvas avatars and in the W3 sidebar header.
//
// This module owns ONLY the visual/semantic mapping — it does not re-derive the
// status. Canvas nodes should read the status from `WebNode.activityStatus`
// (W1 wires it onto the node from W2's response) and pass it here; the W3
// sidebar can pass the status it already has. Keeping derivation (scoring.ts)
// and presentation (here) separate avoids re-resolving the underlying user.
//
// No React / DOM imports so this is trivially unit-testable.
// =============================================================================

import type { ActivityStatus } from "@/lib/scoring";

/** Activity status → ring colour (Tailwind-aligned hexes from the W4 scope). */
export const ACTIVITY_RING_COLORS: Record<ActivityStatus, string> = {
  active: "#3B82F6", // blue
  moderate: "#F59E0B", // amber
  inactive: "#EF4444", // red
};

/**
 * Activity status → short outreach guidance, shown as the ring's hover tooltip.
 * Phrased as an actionable nudge rather than a raw status label.
 */
export const ACTIVITY_RING_LABELS: Record<ActivityStatus, string> = {
  active: "Great time to reach out",
  moderate: "Worth a nudge",
  inactive: "Lead with shared context",
};

/** Combined presentation payload for an activity ring. */
export interface ActivityRing {
  status: ActivityStatus;
  /** Ring stroke colour (hex). */
  color: string;
  /** Hover tooltip / accessible label. */
  label: string;
}

/** Ring colour for a status. */
export function activityRingColor(status: ActivityStatus): string {
  return ACTIVITY_RING_COLORS[status];
}

/** Tooltip / accessible label for a status. */
export function activityRingLabel(status: ActivityStatus): string {
  return ACTIVITY_RING_LABELS[status];
}

/** Full presentation payload (status + colour + label) for an activity ring. */
export function activityRing(status: ActivityStatus): ActivityRing {
  return {
    status,
    color: ACTIVITY_RING_COLORS[status],
    label: ACTIVITY_RING_LABELS[status],
  };
}
