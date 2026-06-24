// =============================================================================
// MOCK MODULE
// =============================================================================
// Workflow 4 owns the real implementation at `src/lib/connections.ts` plus the
// underlying `src/data/connections_data.json`. This file mirrors the EXACT
// symbol surface (function names + signatures + behavior) of that module so W2
// consumers — primarily `src/lib/webBuilder.ts` — can be wired up and tested
// before W4 merges.
//
// When W4 lands on main:
//   1. In every consumer, replace `from '@/mocks/connectionsMock'` with
//      `from '@/lib/connections'`.
//   2. Delete this file (and the `__set*` / `__reset*` test helpers below).
//
// Kept in a separate path on purpose to avoid merge conflicts with the W4
// branch (`src/lib/connections.ts` is owned by W4).
// =============================================================================

export type ConnectionGraph = Record<string, string[]>;

let mockGraph: ConnectionGraph = {};

// ---------------------------------------------------------------------------
// TEST-ONLY helpers (no equivalent in the real W4 module).
// ---------------------------------------------------------------------------

/** TEST-ONLY: seed the in-memory mock connection graph. */
export function __setMockConnectionGraph(graph: ConnectionGraph): void {
  mockGraph = graph;
}

/** TEST-ONLY: clear the in-memory mock connection graph. */
export function __resetMockConnectionGraph(): void {
  mockGraph = {};
}

// ---------------------------------------------------------------------------
// W4 surface — keep signatures + behavior aligned with src/lib/connections.ts
// ---------------------------------------------------------------------------

/** The full adjacency map. Treat as read-only. */
export function getConnectionGraph(): ConnectionGraph {
  return mockGraph;
}

/** Direct (1st-degree) connections for a user. Empty array if unknown. */
export function getConnectionIds(userId: string): string[] {
  return mockGraph[userId] ?? [];
}

/** True if `a` and `b` are directly connected (order-independent). */
export function areConnected(a: string, b: string): boolean {
  if (a === b) return false;
  return getConnectionIds(a).includes(b);
}

/**
 * Connections-of-connections that the user is NOT already directly connected
 * to (and excluding the user themselves). These are the 2nd-degree "people to
 * meet" reachable through a warm intro path. Sorted for determinism.
 */
export function getSecondDegreeIds(userId: string): string[] {
  const firstDegree = getConnectionIds(userId);
  const excluded = new Set<string>(firstDegree);
  excluded.add(userId);

  const result = new Set<string>();
  for (const friendId of firstDegree) {
    for (const candidate of getConnectionIds(friendId)) {
      if (!excluded.has(candidate)) result.add(candidate);
    }
  }
  return [...result].sort();
}
