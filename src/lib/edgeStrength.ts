// =============================================================================
// Edge Strength visuals — presentation mapping (Workflow 4 stretch s12).
// =============================================================================
// Pure, deterministic mapping from a `WebEdge.strength` to the stroke styling
// for the edge on the web canvas. Stronger ties — built up through interaction
// (chats, posts, "I met up") — render thicker, warmer, and eventually pulse, so
// the web visibly "strengthens its roots".
//
// SCALE: the core functions (`edgeStrengthTier`, `edgeStrengthStyle`) work on a
// 0–100 strength scale (matching the store's `interactionScore` / edge strength,
// `DEFAULT_EDGE_STRENGTH = 50`). Inputs are clamped to [0,100] (NaN → weakest).
//
// The web canvas, however, renders the boardState/`buildSnapshot` graph whose
// edge `strength` is on a 0..1 scale (`clamp01`, `CONNECTED_STRENGTH = 0.9`).
// Canvas callers should use `edgeStrengthStyleUnit(strength01)`, which scales a
// 0..1 value into the 0–100 logic. Don't mix the two scales.
//
// The canvas is custom DOM/SVG (not React Flow), so this exposes plain style
// data (colour / width / pulse / optional gradient) that the renderer applies;
// it owns no React/DOM itself and is trivially unit-testable. The top tier uses
// a two-stop gradient, surfaced as `gradient` (the renderer wires a
// <linearGradient>); lower tiers leave it undefined and use the solid `color`.
// =============================================================================

export type EdgeStrengthTier = "faint" | "steady" | "strong" | "vibrant";

/** Lower/upper bound (inclusive) of the 0–100 strength scale. */
export const EDGE_STRENGTH_MIN = 0;
export const EDGE_STRENGTH_MAX = 100;

/** Upper bound (inclusive) of each tier on the 0–100 strength scale. */
export const EDGE_TIER_THRESHOLDS = {
  faint: 25,
  steady: 50,
  strong: 75,
  vibrant: EDGE_STRENGTH_MAX,
} as const;

export interface EdgeGradient {
  from: string;
  to: string;
}

export interface EdgeStrengthStyle {
  tier: EdgeStrengthTier;
  /** Solid stroke colour (also the fallback when a gradient isn't applied). */
  color: string;
  /** SVG stroke width in px. */
  width: number;
  /** Whether the edge should pulse to draw attention to a strong tie. */
  pulse: boolean;
  /** Two-stop gradient for the top tier; undefined for solid tiers. */
  gradient?: EdgeGradient;
}

const STYLES: Record<EdgeStrengthTier, EdgeStrengthStyle> = {
  faint: { tier: "faint", color: "#E0DED8", width: 1, pulse: false }, // LinkedIn border grey
  steady: { tier: "steady", color: "#0A66C2", width: 2, pulse: false }, // LinkedIn blue
  strong: { tier: "strong", color: "#6366F1", width: 3, pulse: true }, // indigo
  vibrant: {
    tier: "vibrant",
    color: "#8B5CF6",
    width: 4,
    pulse: true,
    gradient: { from: "#8B5CF6", to: "#EC4899" }, // violet → pink
  },
};

const clampStrength = (strength: number): number =>
  Math.min(EDGE_STRENGTH_MAX, Math.max(EDGE_STRENGTH_MIN, strength));

/**
 * Bucket a 0–100 edge strength into its tier. Inputs are clamped to the scale,
 * so out-of-range values fall into the nearest tier (NaN is treated as the
 * weakest tier).
 */
export function edgeStrengthTier(strength0to100: number): EdgeStrengthTier {
  const s = clampStrength(
    Number.isNaN(strength0to100) ? EDGE_STRENGTH_MIN : strength0to100,
  );
  if (s <= EDGE_TIER_THRESHOLDS.faint) return "faint";
  if (s <= EDGE_TIER_THRESHOLDS.steady) return "steady";
  if (s <= EDGE_TIER_THRESHOLDS.strong) return "strong";
  return "vibrant";
}

export function edgeStrengthStyle(strength0to100: number): EdgeStrengthStyle {
  const style = STYLES[edgeStrengthTier(strength0to100)];
  return style.gradient
    ? { ...style, gradient: { ...style.gradient } }
    : { ...style };
}

/**
 * Tier for a 0..1 edge strength (the web canvas / boardState scale). Convenience
 * wrapper that scales into the 0–100 `edgeStrengthTier` logic.
 */
export function edgeStrengthTierUnit(strength0to1: number): EdgeStrengthTier {
  return edgeStrengthTier((Number.isNaN(strength0to1) ? 0 : strength0to1) * 100);
}

/**
 * Stroke styling for a 0..1 edge strength (the web canvas / boardState scale).
 * Convenience wrapper that scales into the 0–100 `edgeStrengthStyle` logic.
 */
export function edgeStrengthStyleUnit(strength0to1: number): EdgeStrengthStyle {
  return edgeStrengthStyle((Number.isNaN(strength0to1) ? 0 : strength0to1) * 100);
}
