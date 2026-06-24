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

/**
 * Deterministic randomuser.me portrait URL for a member id. The same id always
 * yields the same URL; different ids spread across both galleries.
 */
export function photoUrlForUser(userId: string): string {
  const h = hashId(userId);
  const gender = h % 2 === 0 ? "men" : "women";
  const index = Math.floor(h / 2) % PORTRAITS_PER_GENDER;
  return `https://randomuser.me/api/portraits/${gender}/${index}.jpg`;
}
