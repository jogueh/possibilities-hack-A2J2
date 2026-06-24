// Diversify the descriptive fields of `src/data/user_data.json` IN PLACE.
//
// Why: the dataset is extremely homogeneous (only ~5 distinct names and 2
// schools across ~1,786 members). This rewrites the *values* of the descriptive
// fields with varied content so the demo looks realistic.
//
// Hard rules (keep the graph + headlines + schema intact):
//   - PRESERVED byte-for-byte: `id`, `connections`, `job_history`, `courses`
//     (referential keys), plus each school entry's `degree` + `graduation_year`.
//   - Array LENGTHS are never changed — we only swap values 1:1. If a member has
//     2 schools / 3 skills, they keep 2 schools / 3 skills.
//   - Deterministic + idempotent: every choice is seeded by the member `id`, so
//     re-running produces identical output.
//
// Name flavor: ~half the members get a funny Gen-Z name (Italian "brainrot"
// memes + popular streamers); the other half get a varied realistic name.
//
// Usage:  node scripts/diversify-users.mjs
//
// NOTE: after running this, regenerate the inlined node names in
// `src/data/web_people.ts` so the canvas nodes still match the NodeSidebar.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

// ── Deterministic PRNG seeded per-member by id ───────────────────────────────
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (id) => mulberry32(xmur3(id)());
const pick = (rng, pool) => pool[Math.floor(rng() * pool.length)];
function sampleDistinct(rng, pool, k) {
  // Guard the "array lengths never change" invariant: if a pool is ever smaller
  // than the count we must reproduce, fail fast instead of silently shortening
  // the member's array.
  if (k > pool.length) {
    throw new Error(
      `sampleDistinct: need ${k} distinct values but pool has only ${pool.length}`,
    );
  }
  const copy = [...pool];
  const out = [];
  for (let i = 0; i < k; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

// ── Value pools ──────────────────────────────────────────────────────────────
// Funny Gen-Z names: Italian "brainrot" memes + popular streamers (clean).
const FUNNY_NAMES = [
  "Tralalero Tralala", "Bombardiro Crocodilo", "Tung Tung Tung Sahur",
  "Lirili Larila", "Ballerina Cappuccina", "Brr Brr Patapim",
  "Chimpanzini Bananini", "Cappuccino Assassino", "Trippi Troppi",
  "Bombombini Gusini", "Boneca Ambalabu", "Frigo Camelo",
  "Glorbo Fruttodrillo", "Trulimero Trulicina", "Bobrito Bandito",
  "La Vaca Saturno Saturnita", "Girafa Celestre", "Orangutini Ananasini",
  "Tigrullini Watermellini", "Espresso Signora", "Burbaloni Luliloli",
  "Zibra Zubra Zibralini", "Rhino Toasterino", "Pomni Pomnini",
  "IShowSpeed", "MrBeast", "Kai Cenat", "Pokimane", "Ninja",
  "Jynxzi", "Adin Ross", "Ludwig Ahgren", "Markiplier", "Sketch",
  "Agent00", "Duke Dennis", "CaseOh", "Ironmouse", "Jasontheween",
  "Stable Ronaldo", "Plaqueboymax", "Quackity", "Karl Jacobs", "Tubbo",
];

// Realistic, multicultural first + last name pools (combined on demand).
const FIRST = [
  "Aaliyah", "Mateo", "Priya", "Wei", "Sofia", "Omar", "Hana", "Diego",
  "Fatima", "Liam", "Yuki", "Aisha", "Noah", "Ingrid", "Kwame", "Elena",
  "Raj", "Mei", "Tomas", "Zara", "Andre", "Nadia", "Hiro", "Lucia",
  "Samir", "Chloe", "Dmitri", "Amara", "Kenji", "Isabella", "Joon",
  "Camila", "Tariq", "Freya", "Bashir", "Leila", "Sven", "Anaya",
  "Marco", "Yara", "Theo", "Imani", "Niko", "Sana",
];
const LAST = [
  "Nguyen", "Patel", "Kim", "Okafor", "Garcia", "Rossi", "Haddad",
  "Muller", "Ivanov", "Suzuki", "Andersson", "Mensah", "Cohen", "Silva",
  "Khan", "Reyes", "Dubois", "Costa", "Singh", "Nakamura", "Olsen",
  "Adeyemi", "Romero", "Fischer", "Larsen", "Bianchi", "Volkov", "Hassan",
  "Park", "Mwangi", "Novak", "Ali", "Schmidt", "Tanaka",
];

const UNIVERSITIES = [
  "Massachusetts Institute of Technology", "Harvard University",
  "Stanford University", "University of California, Berkeley",
  "Carnegie Mellon University", "University of Michigan",
  "Georgia Institute of Technology", "University of Texas at Austin",
  "University of Washington", "Cornell University", "Princeton University",
  "Yale University", "Columbia University",
  "University of Illinois Urbana-Champaign", "University of Toronto",
  "ETH Zurich", "National University of Singapore", "University of Oxford",
  "University of Cambridge", "Tsinghua University",
  "Indian Institute of Technology", "University of Tokyo",
  "McGill University", "University of California, Los Angeles",
  "New York University", "University of Pennsylvania", "Purdue University",
  "University of Wisconsin-Madison", "Duke University",
  "California Institute of Technology",
];

const CITIES = [
  "Seattle, WA", "Boston, MA", "New York, NY", "Austin, TX",
  "San Francisco, CA", "Chicago, IL", "Denver, CO", "Atlanta, GA",
  "Los Angeles, CA", "Portland, OR", "Miami, FL", "Dallas, TX",
  "Phoenix, AZ", "San Diego, CA", "Nashville, TN", "Minneapolis, MN",
  "Pittsburgh, PA", "Raleigh, NC", "Columbus, OH", "Salt Lake City, UT",
];

const SKILLS = [
  "Python", "TypeScript", "React", "Kubernetes", "Go", "Rust", "GraphQL",
  "SQL", "Data Analysis", "Machine Learning", "Cloud Architecture",
  "DevOps", "AWS", "Cybersecurity", "Network Security", "Ethical Hacking",
  "Product Management", "UX Research", "Leadership", "Public Speaking",
  "Data Engineering", "Project Management", "Agile", "Figma", "Tableau",
  "Java", "C++", "Blockchain", "Marketing", "Finance", "Corporate Finance",
  "Investing", "Financial Modeling", "Accounting", "Economics", "Teaching",
  "Nursing", "Healthcare Administration", "Psychology", "Information Security",
  "System Design", "Mobile Development", "Technical Writing", "Mentoring",
];

const POSTS = [
  "Attended a webinar on AI advancements",
  "Completed a new project on GitHub",
  "Participated in a hackathon and won first place",
  "Started a new job at a top tech company",
  "Published a new article on LinkedIn",
  "Spoke at a local tech meetup",
  "Earned a new professional certification",
  "Mentored a junior engineer this quarter",
  "Launched a side project over the weekend",
  "Shared takeaways from an industry conference",
  "Open-sourced a small developer tool",
  "Joined a new volunteer coding program",
  "Wrote a deep-dive on system design",
  "Celebrated a work anniversary",
  "Completed an online specialization",
];

// ── Rewrite ──────────────────────────────────────────────────────────────────
const users = JSON.parse(readFileSync(join(dataDir, "user_data.json"), "utf8"));

let funnyCount = 0;
for (const u of users) {
  const rng = rngFor(u.id);

  // Name: ~50% funny, ~50% realistic (decision drawn first for stable order).
  const funny = rng() < 0.5;
  if (funny) {
    funnyCount++;
    u.name = pick(rng, FUNNY_NAMES);
  } else {
    u.name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  }

  // School history: same entry count, keep degree + graduation_year, swap names.
  const schoolNames = sampleDistinct(rng, UNIVERSITIES, u.school_history.length);
  u.school_history = u.school_history.map((s, i) => ({
    school_name: schoolNames[i] ?? s.school_name,
    degree: s.degree,
    graduation_year: s.graduation_year,
  }));

  // Location, skills, posts: same counts, varied values (distinct within member).
  u.current_location = pick(rng, CITIES);
  u.skills = sampleDistinct(rng, SKILLS, u.skills.length);
  u.posts_activity = sampleDistinct(rng, POSTS, u.posts_activity.length);

  // PRESERVED untouched: id, job_history, courses, connections.
}

writeFileSync(
  join(dataDir, "user_data.json"),
  JSON.stringify(users, null, 4) + "\n",
);

console.log(
  `Diversified ${users.length} members (${funnyCount} funny / ` +
    `${users.length - funnyCount} realistic names). ` +
    `Preserved id/job_history/courses/connections.`,
);
