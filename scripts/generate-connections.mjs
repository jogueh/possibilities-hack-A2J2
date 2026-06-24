// One-time generator for the simulated connection graph.
//
// The hackathon user dataset has NO connection field, so we synthesize a
// persistent, authentic-looking social graph: an attribute-weighted small-world
// network. Two members are more likely to be connected when they share a school,
// company, location, or skill, plus a small fraction of random long-range
// "bridge" edges so the graph isn't just disjoint clusters (this is what makes
// 2nd-degree "people to meet" warm paths meaningful).
//
// Deterministic: a fixed seed makes the output reproducible. Re-run with:
//   node scripts/generate-connections.mjs
//
// Output: this rewrites `src/data/user_data.json` IN PLACE, deduping the ~214
// duplicate member ids (first occurrence wins) and adding a sorted, symmetric
// `connections: [memberId, ...]` field to each member record. The connection
// graph lives ON the member table, so there is no separate adjacency file and
// no module-level graph state to keep in sync.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

// ── Tunable parameters ───────────────────────────────────────────────────────
const SEED = 0x5eed1e;
const MIN_DEGREE = 3; // edges each user initiates (others may add more)
const MAX_DEGREE = 10;
const DEGREE_CAP = 18; // hard cap so popular nodes don't become mega-hubs
const BRIDGE_RATIO = 0.15; // share of a user's initiated edges that are random
const MAX_ATTEMPTS_FACTOR = 8; // give up sampling after target * this attempts

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (n) => Math.floor(rand() * n);
const pick = (arr) => arr[randInt(arr.length)];

// ── Load data ────────────────────────────────────────────────────────────────
const rawUsers = JSON.parse(readFileSync(join(dataDir, "user_data.json"), "utf8"));
const jobs = JSON.parse(readFileSync(join(dataDir, "jobs_data.json"), "utf8"));
const companyByJobId = new Map(jobs.map((j) => [j.id, j.company]));

// The dataset contains duplicate user ids (~214 of 2000). A connection graph
// must be keyed by a unique id, so we dedupe (first occurrence wins) before
// building anything. Everything downstream is keyed by these unique ids.
const seenIds = new Set();
const users = [];
for (const u of rawUsers) {
  if (seenIds.has(u.id)) continue;
  seenIds.add(u.id);
  users.push(u);
}

// Users sorted by id for fully deterministic iteration.
users.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

function companiesOf(user) {
  const out = [];
  for (const jid of user.job_history ?? []) {
    const c = companyByJobId.get(jid);
    if (c) out.push(`company:${c}`);
  }
  return out;
}

// ── Build attribute buckets (inverted index): attrKey -> [userIndex, ...] ─────
const buckets = new Map();
const userBuckets = users.map(() => []); // per-user list of attrKeys it belongs to

function addToBucket(key, idx) {
  let arr = buckets.get(key);
  if (!arr) buckets.set(key, (arr = []));
  arr.push(idx);
  userBuckets[idx].push(key);
}

users.forEach((u, idx) => {
  for (const s of u.school_history ?? []) addToBucket(`school:${s.school_name}`, idx);
  if (u.current_location) addToBucket(`loc:${u.current_location}`, idx);
  for (const sk of u.skills ?? []) addToBucket(`skill:${sk}`, idx);
  for (const c of companiesOf(u)) addToBucket(c, idx);
});

// ── Generate edges ───────────────────────────────────────────────────────────
const adj = users.map(() => new Set()); // index -> Set<index>

function tryAddEdge(a, b) {
  if (a === b) return false;
  if (adj[a].has(b)) return false;
  if (adj[a].size >= DEGREE_CAP || adj[b].size >= DEGREE_CAP) return false;
  adj[a].add(b);
  adj[b].add(a);
  return true;
}

// Sample an affinity candidate for user idx: pick one of its attribute buckets
// uniformly, then a random member of that bucket. Because the bucket is chosen
// uniformly (not weighted by size) and the member uniformly within it, a
// candidate's selection weight is ~1/bucketSize: rarer shared attributes
// (smaller buckets — same niche company/school/skill) are favored over common
// ones (e.g. a big city location). This inverse-frequency bias is deliberate —
// a rare overlap is a stronger "they actually know each other" signal (TF-IDF
// intuition). Sharing more attributes also adds more chances overall.
function sampleAffinity(idx) {
  const myBuckets = userBuckets[idx];
  if (myBuckets.length === 0) return -1;
  const key = pick(myBuckets);
  const members = buckets.get(key);
  return pick(members);
}

users.forEach((_, idx) => {
  const target = MIN_DEGREE + randInt(MAX_DEGREE - MIN_DEGREE + 1);
  const initiated = adj[idx].size; // edges already added by earlier users
  let need = Math.max(0, target - initiated);
  const bridgeCount = Math.round(need * BRIDGE_RATIO);

  let attempts = 0;
  const maxAttempts = need * MAX_ATTEMPTS_FACTOR + 16;
  let added = 0;
  let bridgesAdded = 0;

  while (added < need && attempts < maxAttempts) {
    attempts++;
    const useBridge = bridgesAdded < bridgeCount;
    const cand = useBridge ? randInt(users.length) : sampleAffinity(idx);
    if (cand < 0) continue;
    if (tryAddEdge(idx, cand)) {
      added++;
      if (useBridge) bridgesAdded++;
    }
  }
});

// No isolated nodes: connect any zero-degree user to a valid partner. Random
// attempts first; if those all fail (every pick is self or at DEGREE_CAP), fall
// back to a deterministic forced edge to the lowest-degree other node — bypassing
// DEGREE_CAP for this single edge so connection is guaranteed.
users.forEach((_, idx) => {
  if (adj[idx].size > 0) return;
  let attempts = 0;
  while (adj[idx].size === 0 && attempts < 256) {
    attempts++;
    tryAddEdge(idx, randInt(users.length));
  }
  if (adj[idx].size > 0) return;
  let best = -1;
  for (let j = 0; j < users.length; j++) {
    if (j === idx) continue;
    if (best === -1 || adj[j].size < adj[best].size) best = j;
  }
  if (best !== -1) {
    adj[idx].add(best);
    adj[best].add(idx);
  }
});

// Hard guarantee: the rest of the system relies on no isolated nodes, so fail
// the generation loudly rather than silently emitting an isolated user.
const isolatedIds = users.filter((_, i) => adj[i].size === 0).map((u) => u.id);
if (isolatedIds.length > 0) {
  throw new Error(
    `Generation failed: ${isolatedIds.length} isolated node(s) remain ` +
      `(e.g. ${isolatedIds.slice(0, 5).join(", ")}).`,
  );
}

// ── Write connections onto each member, rewriting user_data.json in place ─────
// `users` is already deduped (first occurrence wins) and sorted by id. Attach a
// sorted `connections` array to each member and emit with the file's existing
// 4-space indentation for a stable, readable diff.
users.forEach((u, idx) => {
  u.connections = [...adj[idx]].map((j) => users[j].id).sort();
});

writeFileSync(
  join(dataDir, "user_data.json"),
  JSON.stringify(users, null, 4) + "\n",
);

// ── Report ───────────────────────────────────────────────────────────────────
const degrees = users.map((_, i) => adj[i].size);
const total = degrees.reduce((a, b) => a + b, 0);
const isolated = degrees.filter((d) => d === 0).length;
console.log(
  `Wrote connections onto ${users.length} members · ` +
    `${total / 2} edges · avg degree ${(total / users.length).toFixed(2)} · ` +
    `min ${Math.min(...degrees)} · max ${Math.max(...degrees)} · isolated ${isolated}`,
);
