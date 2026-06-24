// Deterministic profile-photo URLs (Workflow 4).
//
// The hackathon dataset has no photos, so we derive a stable avatar URL from a
// member id. "Deterministic" matters: the same person appears on canvas nodes,
// the sidebar, and job overlaps, so their face must be identical everywhere and
// across reloads — a random-per-request source (e.g. thispersondoesnotexist.com)
// can't do that. We map onto randomuser.me's fixed portrait set (100 "men" + 100
// "women"), keyed by a hash of the id, giving each member a consistent face.
//
// NOTE: keep the hashing/URL logic in sync with `scripts/generate-photos.mjs`,
// which materialises the same value into `user.photo` in `user_data.json`.

const PORTRAITS_PER_GENDER = 100;

/** Stable 32-bit FNV-1a hash of a string. */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// First-name → gender lookup so a member's portrait matches the gender implied
// by their name (a male name must not get a "women" portrait, and vice-versa).
// Covers every first name in the dataset; unknown names fall back to the id hash.
// Keep in sync with `scripts/generate-photos.mjs`.
const MALE_NAMES = new Set([
  "james", "john", "robert", "michael", "william", "david", "richard", "joseph",
  "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark",
  "donald", "steven", "paul", "andrew", "joshua", "kevin", "brian", "george",
  "edward", "ronald",
]);
const FEMALE_NAMES = new Set([
  "mary", "patricia", "jennifer", "linda", "elizabeth", "barbara", "susan",
  "jessica", "sarah", "karen", "nancy", "lisa", "betty", "margaret", "sandra",
  "ashley", "kimberly", "emily", "donna", "michelle",
]);

/** Gender implied by a member's name, or null when the name is unknown. */
export function genderForName(name?: string): "men" | "women" | null {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  if (MALE_NAMES.has(first)) return "men";
  if (FEMALE_NAMES.has(first)) return "women";
  return null;
}

/**
 * Deterministic randomuser.me portrait URL for a member. The same id always
 * yields the same URL; the portrait gender follows the member's name when known
 * (falling back to the id hash), so the face never contradicts the name.
 */
export function photoUrlForUser(userId: string, name?: string): string {
  const h = hashId(userId);
  const gender = genderForName(name) ?? (h % 2 === 0 ? "men" : "women");
  const index = Math.floor(h / 2) % PORTRAITS_PER_GENDER;
  return `https://randomuser.me/api/portraits/${gender}/${index}.jpg`;
}
