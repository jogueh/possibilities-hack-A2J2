// One-time generator for deterministic member profile photos.
//
// The hackathon user dataset has NO photo field. This materialises a stable
// avatar URL onto each member record so the same person shows the same face on
// the canvas, in the sidebar, and across reloads. A random-per-request source
// (thispersondoesnotexist.com) can't give per-member stability, so we map onto
// randomuser.me's fixed portrait galleries (100 "men" + 100 "women"), keyed by a
// hash of the member id.
//
// Deterministic & idempotent: re-running produces identical output. Run with:
//   node scripts/generate-photos.mjs
//
// Output: rewrites `src/data/user_data.json` IN PLACE, adding/refreshing a
// `photo` field on each member record.
//
// NOTE: the hashing/URL logic MUST stay in sync with `src/lib/avatarPhoto.ts`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const userDataPath = join(__dirname, "..", "src", "data", "user_data.json");

const PORTRAITS_PER_GENDER = 100;

// First-name → gender lookup so a member's portrait matches the gender implied
// by their name. Keep in sync with `src/lib/avatarPhoto.ts`.
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

function genderForName(name) {
  if (!name) return null;
  const first = name.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  if (MALE_NAMES.has(first)) return "men";
  if (FEMALE_NAMES.has(first)) return "women";
  return null;
}

function hashId(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function photoUrlForUser(userId, name) {
  const h = hashId(userId);
  const gender = genderForName(name) ?? (h % 2 === 0 ? "men" : "women");
  const index = Math.floor(h / 2) % PORTRAITS_PER_GENDER;
  return `https://randomuser.me/api/portraits/${gender}/${index}.jpg`;
}

const users = JSON.parse(readFileSync(userDataPath, "utf8"));
for (const user of users) {
  user.photo = photoUrlForUser(user.id, user.name);
}
writeFileSync(userDataPath, JSON.stringify(users, null, 4) + "\n");

console.log(`Added photo field to ${users.length} member records.`);
