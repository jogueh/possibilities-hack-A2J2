// ⚠️ W3 MOCK — replace with W1 real impl at `src/lib/alignmentColors.ts`. See plan.md
// Avatar ring color by goal-alignment tier (W1 design system). Same export names as W1.
import type { AlignmentTier } from "@/mocks/web";

export const ALIGNMENT_COLORS: Record<AlignmentTier, string> = {
  strong: "#0A66C2", // LinkedIn blue
  moderate: "#F59E0B", // amber
  weak: "#9CA3AF", // grey
};

export const ALIGNMENT_LABELS: Record<AlignmentTier, string> = {
  strong: "Strong match for your goal",
  moderate: "Moderate match",
  weak: "Weak match",
};

export function alignmentColor(tier: AlignmentTier): string {
  return ALIGNMENT_COLORS[tier];
}
