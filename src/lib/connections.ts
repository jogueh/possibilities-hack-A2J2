// Pure, stateless helpers for reading the connection graph.
//
// Connections live as a `connections: string[]` field ON each member record
// (see scripts/generate-connections.mjs), so there is NO module-level graph
// state here — every function operates on data passed in by the caller. This
// avoids the shared-process-state pitfall of a module singleton in a Next.js
// server runtime, and means "newly-made connections" are just edits to the
// member object in the caller's own (per-user) store.
//
// Callers that need to resolve ids → members pass a `MemberLookup` (a Map or a
// plain id→member record). Reads never mutate their inputs.

/** Minimal member shape these helpers need: an id and its connection ids. */
export interface ConnectedMember {
  id: string;
  connections: string[];
}

/** Id → member resolver. A Map or a plain Record both satisfy this. */
export type MemberLookup<T extends ConnectedMember = ConnectedMember> =
  | ReadonlyMap<string, T>
  | Readonly<Record<string, T>>;

function lookup<T extends ConnectedMember>(
  members: MemberLookup<T>,
  id: string,
): T | undefined {
  return members instanceof Map ? members.get(id) : (members as Record<string, T>)[id];
}

/**
 * Direct (1st-degree) connection ids for a member, as a fresh array. Mutating
 * the returned array does not affect the member record.
 */
export function getConnectionIds(member: ConnectedMember | undefined): string[] {
  return member ? [...member.connections] : [];
}

/** True if `a` and `b` are directly connected (order-independent). */
export function areConnected(
  a: ConnectedMember | undefined,
  b: ConnectedMember | undefined,
): boolean {
  if (!a || !b || a.id === b.id) return false;
  return a.connections.includes(b.id);
}

/**
 * Connections-of-connections that the member is NOT already directly connected
 * to (and excluding themselves) — the 2nd-degree "people to meet" reachable via
 * a warm intro path. Unknown friend ids are skipped. Result is sorted.
 */
export function getSecondDegreeIds<T extends ConnectedMember>(
  member: ConnectedMember | undefined,
  members: MemberLookup<T>,
): string[] {
  if (!member) return [];
  const excluded = new Set<string>(member.connections);
  excluded.add(member.id);

  const result = new Set<string>();
  for (const friendId of member.connections) {
    const friend = lookup(members, friendId);
    if (!friend) continue;
    for (const candidate of friend.connections) {
      if (!excluded.has(candidate)) result.add(candidate);
    }
  }
  return [...result].sort();
}

/**
 * Goal-AGNOSTIC connection suggestions for a member — purely structural, no goal
 * or scoring awareness (that ranking is layered on top by the web builder).
 *
 * The safety-net floor that guarantees a member always has people to connect
 * with, including a fully isolated member with zero connections:
 *   1. Warm paths first: 2nd-degree "people to meet" (friends-of-friends).
 *   2. Fallback: the most-connected hubs the member isn't already linked to —
 *      good people to know, and the only option when there are no warm paths.
 *
 * Excludes the member and their existing 1st-degree connections. Deterministic.
 */
export function suggestConnections<T extends ConnectedMember>(
  member: ConnectedMember | undefined,
  members: MemberLookup<T>,
  limit = 5,
): string[] {
  if (!member || limit <= 0) return [];

  const excluded = new Set<string>(member.connections);
  excluded.add(member.id);

  const ranked: string[] = [];
  const seen = new Set<string>();

  for (const id of getSecondDegreeIds(member, members)) {
    ranked.push(id);
    seen.add(id);
    if (ranked.length >= limit) return ranked;
  }

  // Fallback: well-connected hubs, most connections first (id breaks ties).
  const all: T[] = members instanceof Map ? [...members.values()] : Object.values(members);
  const hubs = all
    .filter((m) => !excluded.has(m.id) && !seen.has(m.id))
    .sort((a, b) => {
      const diff = b.connections.length - a.connections.length;
      return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  for (const m of hubs) {
    ranked.push(m.id);
    if (ranked.length >= limit) break;
  }
  return ranked;
}
