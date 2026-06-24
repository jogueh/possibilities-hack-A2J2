import { describe, it, expect } from "vitest";
import {
  getConnectionIds,
  areConnected,
  getSecondDegreeIds,
  suggestConnections,
  type ConnectedMember,
} from "./connections";

// Small hand-built member table (symmetric connections):
//   a — b — c
//   a — d
//   c — e
// 1st-degree(a) = [b, d]; b's friends = a, c → 2nd-degree(a) = [c]
function member(id: string, connections: string[]): ConnectedMember {
  return { id, connections };
}

const a = member("a", ["b", "d"]);
const b = member("b", ["a", "c"]);
const c = member("c", ["b", "e"]);
const d = member("d", ["a"]);
const e = member("e", ["c"]);

const byId: Record<string, ConnectedMember> = { a, b, c, d, e };
const asMap = new Map(Object.entries(byId));

describe("getConnectionIds", () => {
  it("returns direct connections", () => {
    expect(getConnectionIds(a)).toEqual(["b", "d"]);
  });

  it("returns an empty array for an undefined member", () => {
    expect(getConnectionIds(undefined)).toEqual([]);
  });

  it("returns a copy that does not mutate the member record", () => {
    const ids = getConnectionIds(a);
    ids.push("hacked");
    ids.sort();
    expect(a.connections).toEqual(["b", "d"]);
  });
});

describe("areConnected", () => {
  it("is true for directly connected members (both directions)", () => {
    expect(areConnected(a, b)).toBe(true);
    expect(areConnected(b, a)).toBe(true);
  });

  it("is false for non-adjacent members", () => {
    expect(areConnected(a, c)).toBe(false);
  });

  it("is false for self and for undefined inputs", () => {
    expect(areConnected(a, a)).toBe(false);
    expect(areConnected(a, undefined)).toBe(false);
    expect(areConnected(undefined, b)).toBe(false);
  });
});

describe("getSecondDegreeIds", () => {
  it("returns friends-of-friends excluding self and 1st-degree (Record lookup)", () => {
    expect(getSecondDegreeIds(a, byId)).toEqual(["c"]);
  });

  it("works with a Map lookup too", () => {
    expect(getSecondDegreeIds(a, asMap)).toEqual(["c"]);
  });

  it("excludes anyone already directly connected", () => {
    expect(getSecondDegreeIds(c, byId)).toEqual(["a"]);
  });

  it("skips unknown friend ids", () => {
    const lonely = member("lonely", ["ghost"]);
    expect(getSecondDegreeIds(lonely, byId)).toEqual([]);
  });

  it("returns an empty array for an undefined member", () => {
    expect(getSecondDegreeIds(undefined, byId)).toEqual([]);
  });

  it("returns sorted, de-duplicated ids", () => {
    const result = getSecondDegreeIds(a, byId);
    expect([...result].sort()).toEqual(result);
    expect(new Set(result).size).toBe(result.length);
  });
});

describe("suggestConnections", () => {
  it("prefers warm 2nd-degree paths", () => {
    expect(suggestConnections(a, byId, 1)).toEqual(["c"]);
  });

  it("excludes self and existing 1st-degree connections", () => {
    const suggestions = suggestConnections(a, byId, 5);
    expect(suggestions).not.toContain("a");
    expect(suggestions).not.toContain("b");
    expect(suggestions).not.toContain("d");
  });

  it("falls back to hubs when warm paths run out", () => {
    // a's only 2nd-degree is c; only e remains as a hub fallback in this table.
    const suggestions = suggestConnections(a, byId, 5);
    expect(suggestions[0]).toBe("c");
    expect(suggestions).toContain("e");
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });

  it("still suggests hubs for an isolated member with zero connections", () => {
    const loner = member("loner", []);
    const table = { ...byId, loner };
    const suggestions = suggestConnections(loner, table, 2);
    expect(suggestions.length).toBe(2);
    expect(suggestions).not.toContain("loner");
    // Hubs ranked by degree desc, ties broken by id asc: a, b, c each have 2.
    expect(new Set(suggestions)).toEqual(new Set(["a", "b"]));
  });

  it("returns an empty array for a non-positive limit or undefined member", () => {
    expect(suggestConnections(a, byId, 0)).toEqual([]);
    expect(suggestConnections(undefined, byId, 5)).toEqual([]);
  });
});
