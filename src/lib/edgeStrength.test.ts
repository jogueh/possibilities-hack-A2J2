import { describe, it, expect } from "vitest";
import {
  EDGE_TIER_THRESHOLDS,
  edgeStrengthStyle,
  edgeStrengthTier,
  type EdgeStrengthTier,
} from "./edgeStrength";

const ALL_TIERS: EdgeStrengthTier[] = ["faint", "steady", "strong", "vibrant"];

describe("edgeStrengthTier", () => {
  it("buckets each strength band per the scope table", () => {
    expect(edgeStrengthTier(0)).toBe("faint");
    expect(edgeStrengthTier(25)).toBe("faint");
    expect(edgeStrengthTier(26)).toBe("steady");
    expect(edgeStrengthTier(50)).toBe("steady");
    expect(edgeStrengthTier(51)).toBe("strong");
    expect(edgeStrengthTier(75)).toBe("strong");
    expect(edgeStrengthTier(76)).toBe("vibrant");
    expect(edgeStrengthTier(100)).toBe("vibrant");
  });

  it("uses inclusive upper bounds matching the exported thresholds", () => {
    expect(edgeStrengthTier(EDGE_TIER_THRESHOLDS.faint)).toBe("faint");
    expect(edgeStrengthTier(EDGE_TIER_THRESHOLDS.steady)).toBe("steady");
    expect(edgeStrengthTier(EDGE_TIER_THRESHOLDS.strong)).toBe("strong");
  });

  it("clamps out-of-range values into the nearest tier", () => {
    expect(edgeStrengthTier(-10)).toBe("faint");
    expect(edgeStrengthTier(150)).toBe("vibrant");
  });

  it("treats NaN as the weakest tier", () => {
    expect(edgeStrengthTier(NaN)).toBe("faint");
  });
});

describe("edgeStrengthStyle", () => {
  it("returns the scoped colour/width/pulse for each tier", () => {
    expect(edgeStrengthStyle(10)).toMatchObject({
      tier: "faint",
      color: "#E0DED8",
      width: 1,
      pulse: false,
    });
    expect(edgeStrengthStyle(40)).toMatchObject({
      tier: "steady",
      color: "#0A66C2",
      width: 2,
      pulse: false,
    });
    expect(edgeStrengthStyle(60)).toMatchObject({
      tier: "strong",
      color: "#6366F1",
      width: 3,
      pulse: true,
    });
  });

  it("exposes a gradient (and pulse) only for the vibrant top tier", () => {
    const vibrant = edgeStrengthStyle(90);
    expect(vibrant.tier).toBe("vibrant");
    expect(vibrant.width).toBe(4);
    expect(vibrant.pulse).toBe(true);
    expect(vibrant.gradient).toEqual({ from: "#8B5CF6", to: "#EC4899" });

    // Solid tiers carry no gradient.
    for (const s of [10, 40, 60]) {
      expect(edgeStrengthStyle(s).gradient).toBeUndefined();
    }
  });

  it("monotonically increases stroke width as strength grows", () => {
    const widths = [10, 40, 60, 90].map((s) => edgeStrengthStyle(s).width);
    expect(widths).toEqual([1, 2, 3, 4]);
  });

  it("defines a complete, distinct style for every tier", () => {
    const colors = ALL_TIERS.map((t) => {
      const sample = { faint: 10, steady: 40, strong: 60, vibrant: 90 }[t];
      return edgeStrengthStyle(sample).color;
    });
    expect(new Set(colors).size).toBe(ALL_TIERS.length);
  });
});
