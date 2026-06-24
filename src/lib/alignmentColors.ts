// Avatar ring colour + label by goal-alignment tier (W1 design system, promoted
// from src/mocks/alignmentColors.ts as part of the mock-to-real migration).
import type { AlignmentTier } from "@/types/web";

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
