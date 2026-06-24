// Add deterministic tech-role coverage to the local jobs dataset and reassign
// member job histories so network recommendations have meaningful role/location
// variety for goals like "Engineer in San Francisco" or "Product Manager".
//
// Usage: node scripts/diversify-jobs.mjs
//
// The generator is intentionally self-contained: no LLM calls, no dependencies,
// and all random-looking choices come from deterministic seeded helpers. Re-run
// safety: existing generated jobs with the `job_tech_` prefix are replaced with
// the same generated records, then user histories are deterministically rebuilt.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");
const jobsPath = join(dataDir, "jobs_data.json");
const usersPath = join(dataDir, "user_data.json");

const GENERATED_ID_PREFIX = "job_tech_";
const TECH_USER_RATIO = 0.36;

const MAIN_LOCATIONS = [
  "San Francisco, CA",
  "New York, NY",
  "Boston, MA",
  "Seattle, WA",
  "Austin, TX",
];
const MAIN_LOCATION_SET = new Set(MAIN_LOCATIONS);
const OTHER_LOCATIONS = [
  "Denver, CO",
  "Chicago, IL",
  "Atlanta, GA",
  "Los Angeles, CA",
  "Portland, OR",
  "Dallas, TX",
  "Raleigh, NC",
  "Salt Lake City, UT",
];

const TECH_COMPANIES = [
  "Stripe",
  "Notion",
  "Figma",
  "Datadog",
  "Snowflake",
  "Anthropic",
  "OpenAI",
  "Vercel",
  "Cloudflare",
  "Asana",
  "Linear",
  "Atlassian",
  "Square",
  "Plaid",
  "GitHub",
  "Google",
  "Meta",
  "Apple",
  "Microsoft",
  "Amazon Web Services",
  "Netflix",
  "NVIDIA",
  "Adobe",
  "Salesforce",
  "Twilio",
  "MongoDB",
  "HashiCorp",
  "Docker",
  "Rippling",
  "Airbnb",
  "Uber",
  "Lyft",
  "Block",
  "Shopify",
  "Instacart",
  "Gusto",
  "Chime",
  "Brex",
  "DoorDash",
  "Databricks",
  "Confluent",
  "Sentry",
  "Retool",
  "Mercury",
  "Airtable",
  "Canva",
  "Dropbox",
  "Cobalt Software",
  "Trailhead Software",
  "Nimbus Cloud",
  "Aurora Networks",
  "Ironclad Security",
  "Quantum Logic",
  "Lumina Labs",
  "Meridian Analytics",
  "Cedar AI",
  "Cohere Health",
  "Carbon Health",
  "Benchling",
  "Oscar Health",
];
const FINTECH_COMPANIES = new Set([
  "Stripe",
  "Square",
  "Plaid",
  "Block",
  "Chime",
  "Brex",
  "Mercury",
  "Gusto",
]);
const HEALTHTECH_COMPANIES = new Set([
  "Cohere Health",
  "Carbon Health",
  "Benchling",
  "Oscar Health",
]);

const ROLE_SPECS = [
  { position: "Software Engineer", count: 42, level: "Mid", salary: [130000, 200000], category: "software" },
  { position: "Senior Software Engineer", count: 35, level: "Senior", salary: [170000, 260000], category: "software" },
  { position: "Staff Software Engineer", count: 16, level: "Senior", salary: [220000, 340000], category: "software" },
  { position: "Backend Engineer", count: 40, level: "Mid", salary: [130000, 210000], category: "backend" },
  { position: "Frontend Engineer", count: 30, level: "Mid", salary: [120000, 190000], category: "frontend" },
  { position: "Full Stack Engineer", count: 30, level: "Mid", salary: [125000, 200000], category: "software" },
  { position: "Mobile Engineer", count: 10, level: "Mid", salary: [125000, 200000], category: "mobile" },
  { position: "iOS Engineer", count: 10, level: "Mid", salary: [130000, 205000], category: "mobile" },
  { position: "Android Engineer", count: 10, level: "Mid", salary: [130000, 205000], category: "mobile" },
  { position: "DevOps Engineer", count: 38, level: "Mid", salary: [140000, 220000], category: "infra" },
  { position: "Site Reliability Engineer", count: 24, level: "Senior", salary: [150000, 240000], category: "infra" },
  { position: "Data Engineer", count: 28, level: "Mid", salary: [135000, 215000], category: "data" },
  { position: "Data Scientist", count: 38, level: "Mid", salary: [140000, 230000], category: "data" },
  { position: "Machine Learning Engineer", count: 28, level: "Senior", salary: [155000, 250000], category: "ml" },
  { position: "MLOps Engineer", count: 10, level: "Senior", salary: [150000, 240000], category: "ml" },
  { position: "Security Engineer", count: 20, level: "Senior", salary: [145000, 230000], category: "security" },
  { position: "Cloud Engineer", count: 20, level: "Mid", salary: [140000, 220000], category: "infra" },
  { position: "Platform Engineer", count: 20, level: "Senior", salary: [150000, 240000], category: "infra" },
  { position: "QA Engineer", count: 15, level: "Mid", salary: [95000, 160000], category: "quality" },
  { position: "Test Engineer", count: 10, level: "Mid", salary: [90000, 150000], category: "quality" },
  { position: "Engineering Manager", count: 18, level: "Management", salary: [200000, 300000], category: "leadership" },
  { position: "Director of Engineering", count: 6, level: "Management", salary: [230000, 380000], category: "leadership" },
  { position: "Solutions Architect", count: 15, level: "Senior", salary: [170000, 270000], category: "architecture" },
  { position: "Cloud Architect", count: 15, level: "Senior", salary: [180000, 290000], category: "architecture" },
  { position: "Product Manager", count: 40, level: "Mid", salary: [135000, 220000], category: "product" },
  { position: "Senior Product Manager", count: 18, level: "Senior", salary: [170000, 260000], category: "product" },
  { position: "Group Product Manager", count: 6, level: "Management", salary: [210000, 320000], category: "product" },
  { position: "Technical Product Manager", count: 20, level: "Senior", salary: [150000, 240000], category: "product" },
  { position: "UX Designer", count: 15, level: "Mid", salary: [110000, 180000], category: "design" },
  { position: "UI Designer", count: 8, level: "Mid", salary: [105000, 170000], category: "design" },
  { position: "Product Designer", count: 15, level: "Mid", salary: [115000, 190000], category: "design" },
  { position: "Technical Writer", count: 6, level: "Mid", salary: [90000, 150000], category: "docs" },
  { position: "Developer Relations", count: 6, level: "Senior", salary: [130000, 210000], category: "devrel" },
  { position: "Developer Advocate", count: 6, level: "Senior", salary: [130000, 210000], category: "devrel" },
];

const DESCRIPTION_TEMPLATES = {
  software: [
    (role, company) => `Build customer-facing product features and scalable services as a ${role} at ${company}.`,
    (role, company) => `Ship reliable software with a cross-functional team as a ${role} at ${company}.`,
    (role, company) => `Design, implement, and operate high-quality product systems as a ${role} at ${company}.`,
  ],
  backend: [
    (role, company) => `Build distributed APIs, data models, and core platform services as a ${role} at ${company}.`,
    (role, company) => `Own server-side architecture and production reliability as a ${role} at ${company}.`,
  ],
  frontend: [
    (role, company) => `Create polished web experiences and reusable UI systems as a ${role} at ${company}.`,
    (role, company) => `Partner with design and product to ship fast, accessible interfaces as a ${role} at ${company}.`,
  ],
  mobile: [
    (role, company) => `Build performant mobile experiences for customers around the world as a ${role} at ${company}.`,
    (role, company) => `Own native app features, quality, and release velocity as a ${role} at ${company}.`,
  ],
  infra: [
    (role, company) => `Scale cloud infrastructure, deployment automation, and observability as a ${role} at ${company}.`,
    (role, company) => `Improve reliability, incident response, and developer productivity as a ${role} at ${company}.`,
  ],
  data: [
    (role, company) => `Turn product data into trusted pipelines, models, and insights as a ${role} at ${company}.`,
    (role, company) => `Partner with engineering and business teams to build data products as a ${role} at ${company}.`,
  ],
  ml: [
    (role, company) => `Develop machine-learning systems from experimentation through production as a ${role} at ${company}.`,
    (role, company) => `Build model platforms, evaluation workflows, and AI-powered features as a ${role} at ${company}.`,
  ],
  security: [
    (role, company) => `Protect production systems, customer data, and developer workflows as a ${role} at ${company}.`,
    (role, company) => `Lead application security reviews, threat modeling, and detection improvements as a ${role} at ${company}.`,
  ],
  quality: [
    (role, company) => `Raise release confidence with automation, tooling, and test strategy as a ${role} at ${company}.`,
    (role, company) => `Build robust quality systems for product and platform teams as a ${role} at ${company}.`,
  ],
  leadership: [
    (role, company) => `Lead engineering teams through technical strategy, execution, and mentorship as a ${role} at ${company}.`,
    (role, company) => `Grow teams and deliver ambitious product roadmaps as a ${role} at ${company}.`,
  ],
  architecture: [
    (role, company) => `Design secure cloud architectures and guide enterprise implementations as a ${role} at ${company}.`,
    (role, company) => `Translate customer needs into scalable technical solutions as a ${role} at ${company}.`,
  ],
  product: [
    (role, company) => `Define strategy, prioritize roadmaps, and launch customer-centered products as a ${role} at ${company}.`,
    (role, company) => `Work with design, engineering, and go-to-market teams to shape product outcomes as a ${role} at ${company}.`,
  ],
  design: [
    (role, company) => `Craft intuitive workflows, prototypes, and design systems as a ${role} at ${company}.`,
    (role, company) => `Turn customer research into polished product experiences as a ${role} at ${company}.`,
  ],
  docs: [
    (role, company) => `Create clear developer documentation, guides, and API references as a ${role} at ${company}.`,
    (role, company) => `Help technical audiences succeed through crisp product education as a ${role} at ${company}.`,
  ],
  devrel: [
    (role, company) => `Support developer communities through demos, content, and feedback loops as a ${role} at ${company}.`,
    (role, company) => `Build sample apps, talks, and technical programs for developers as a ${role} at ${company}.`,
  ],
};

const TECH_TITLE_PATTERNS = [
  /\bsoftware engineer\b/i,
  /\bstaff software engineer\b/i,
  /\bsenior software engineer\b/i,
  /\bbackend engineer\b/i,
  /\bfrontend engineer\b/i,
  /\bfull stack (engineer|developer)\b/i,
  /\bmobile (engineer|developer)\b/i,
  /\bios engineer\b/i,
  /\bandroid engineer\b/i,
  /\bdevops engineer\b/i,
  /\bsite reliability engineer\b/i,
  /\bdata engineer\b/i,
  /\bdata scientist\b/i,
  /\bmachine learning engineer\b/i,
  /\bmlops engineer\b/i,
  /\bsecurity engineer\b/i,
  /\bcloud engineer\b/i,
  /\bplatform engineer\b/i,
  /\bqa engineer\b/i,
  /\btest engineer\b/i,
  /\bengineering manager\b/i,
  /\bdirector of engineering\b/i,
  /\bsolutions architect\b/i,
  /\bcloud architect\b/i,
  /\b(product manager|senior product manager|group product manager|technical product manager)\b/i,
  /\bux designer\b/i,
  /\bui designer\b/i,
  /\bproduct designer\b/i,
  /\btechnical writer\b/i,
  /\bdeveloper relations\b/i,
  /\bdeveloper advocate\b/i,
  /\btechnical program manager\b/i,
];

function hash32(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const rngFor = (key) => lcg(hash32(`a2j2:${key}`));
const randInt = (rng, n) => Math.floor(rng() * n);
const pick = (rng, values) => values[randInt(rng, values.length)];
const padId = (n) => String(n).padStart(5, "0");
const roundToFiveThousand = (n) => Math.round(n / 5000) * 5000;

function isTechJob(job) {
  return (
    job.id.startsWith(GENERATED_ID_PREFIX) ||
    TECH_TITLE_PATTERNS.some((pattern) => pattern.test(job.position))
  );
}

function chooseIndustry(company, rng) {
  if (FINTECH_COMPANIES.has(company) && rng() < 0.7) return "Finance";
  if (HEALTHTECH_COMPANIES.has(company) && rng() < 0.75) return "Healthcare";
  return rng() < 0.58 ? "Technology" : "Software";
}

function chooseLocation(position, count, index) {
  const salt = hash32(position) % MAIN_LOCATIONS.length;
  const mainQuota = Math.min(
    count,
    Math.max(count >= MAIN_LOCATIONS.length ? MAIN_LOCATIONS.length : count, Math.round(count * 0.82)),
  );

  if (index < mainQuota) {
    return MAIN_LOCATIONS[(index + salt) % MAIN_LOCATIONS.length];
  }
  return OTHER_LOCATIONS[(index - mainQuota + salt) % OTHER_LOCATIONS.length];
}

function salaryRangeFor(spec, location, rng) {
  const multipliers = {
    "San Francisco, CA": 1.12,
    "New York, NY": 1.08,
    "Seattle, WA": 1.06,
    "Boston, MA": 1.04,
    "Austin, TX": 0.96,
    "Los Angeles, CA": 1.03,
    "Denver, CO": 0.96,
    "Chicago, IL": 0.97,
    "Atlanta, GA": 0.92,
    "Portland, OR": 0.94,
    "Dallas, TX": 0.94,
    "Raleigh, NC": 0.91,
    "Salt Lake City, UT": 0.9,
  };
  const multiplier = multipliers[location] ?? 1;
  const from = roundToFiveThousand(spec.salary[0] * multiplier + (rng() - 0.5) * 10000);
  const to = roundToFiveThousand(spec.salary[1] * multiplier + (rng() - 0.5) * 15000);
  return {
    from: String(Math.max(80000, from)),
    to: String(Math.max(from + 25000, to)),
  };
}

function descriptionFor(spec, company, rng) {
  const templates = DESCRIPTION_TEMPLATES[spec.category] ?? DESCRIPTION_TEMPLATES.software;
  return pick(rng, templates)(spec.position, company);
}

function generateTechJobs(baseJobs) {
  const generated = [];
  const existingIds = new Set(baseJobs.map((job) => job.id));
  let nextId = 1;

  for (const spec of ROLE_SPECS) {
    for (let i = 0; i < spec.count; i += 1) {
      const id = `${GENERATED_ID_PREFIX}${padId(nextId)}`;
      if (existingIds.has(id)) {
        throw new Error(`Generated job id collides with existing data: ${id}`);
      }

      const rng = rngFor(`${spec.position}:${i}`);
      const company = pick(rng, TECH_COMPANIES);
      const location = chooseLocation(spec.position, spec.count, i);
      const industry = chooseIndustry(company, rng);
      generated.push({
        id,
        company,
        location,
        position: spec.position,
        salary_range: salaryRangeFor(spec, location, rng),
        industry,
        level: spec.level,
        easy_apply: rng() < 0.68,
        description: descriptionFor(spec, company, rng),
      });
      nextId += 1;
    }
  }

  return generated;
}

function groupBy(items, keyFn) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }
  return grouped;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function takeDistinctJobs(rng, primaryPool, fallbackPool, count, usedIds) {
  const chosen = [];

  for (const pool of [primaryPool, fallbackPool]) {
    const candidates = pool.filter((job) => !usedIds.has(job.id));
    while (chosen.length < count && candidates.length > 0) {
      const [job] = candidates.splice(randInt(rng, candidates.length), 1);
      chosen.push(job);
      usedIds.add(job.id);
    }
    if (chosen.length === count) break;
  }

  if (chosen.length < count) {
    throw new Error(`Unable to choose ${count} distinct jobs from available pools`);
  }

  return chosen;
}

function selectTechUserIds(users) {
  const selected = new Set();
  const byLocation = groupBy(users, (user) => user.current_location);

  for (const [location, locationUsers] of byLocation) {
    const target = Math.round(locationUsers.length * TECH_USER_RATIO);
    const ranked = [...locationUsers].sort((a, b) => {
      const ah = hash32(`tech-user:${location}:${a.id}`);
      const bh = hash32(`tech-user:${location}:${b.id}`);
      return ah - bh || a.id.localeCompare(b.id);
    });
    for (const user of ranked.slice(0, target)) selected.add(user.id);
  }

  return selected;
}

function desiredTechSlots(user, historyLength, isSelectedTechUser) {
  if (!isSelectedTechUser || historyLength === 0) return 0;
  if (historyLength === 1) return 1;

  const rng = rngFor(`tech-slots:${user.id}`);
  const roll = rng();
  if (historyLength === 2) return roll < 0.64 ? 2 : 1;
  if (historyLength === 3) return roll < 0.5 ? 3 : 2;
  if (historyLength === 4) return roll < 0.35 ? 4 : roll < 0.7 ? 3 : 2;
  return roll < 0.22 ? historyLength : Math.max(2, historyLength - 1);
}

// Every member should have at least 2 entries in their job_history so the
// "missing experience" footprint goes away (originally ~50% of users had
// only 1 job, which makes the network UI feel sparse — single headline,
// no career arc). Distribution is derived purely from `user.id` so re-running
// the script is idempotent (no length drift across runs). The output
// distribution leans toward 2-3 jobs per user, with some growing to 4 for
// variety, none below 2.
const MAX_HISTORY = 4;

function computeTargetHistoryLength(user) {
  const rng = rngFor(`length:${user.id}`);
  const roll = rng();
  // ~35% length 2, ~40% length 3, ~25% length 4. Deterministic from user.id
  // alone so re-running the script produces the identical output.
  if (roll < 0.35) return 2;
  if (roll < 0.75) return 3;
  return MAX_HISTORY;
}

function rebuildUserHistories(users, allJobs) {
  const selectedTechUsers = selectTechUserIds(users);
  const techJobs = allJobs.filter(isTechJob);
  const nonTechJobs = allJobs.filter((job) => !isTechJob(job));
  const techByLocation = groupBy(techJobs, (job) => job.location);
  const nonTechByLocation = groupBy(nonTechJobs, (job) => job.location);
  const allJobIds = new Set(allJobs.map((job) => job.id));

  for (const user of users) {
    const historyLength = computeTargetHistoryLength(user);
    const rng = rngFor(`history:${user.id}`);
    const used = new Set();
    const techSlots = desiredTechSlots(user, historyLength, selectedTechUsers.has(user.id));
    const nonTechSlots = historyLength - techSlots;

    const sameLocationTech = techByLocation.get(user.current_location) ?? [];
    const sameLocationNonTech = nonTechByLocation.get(user.current_location) ?? [];
    const techPrimary = MAIN_LOCATION_SET.has(user.current_location)
      ? sameLocationTech
      : sameLocationTech.length > 0
        ? sameLocationTech
        : techJobs;
    const nonTechPrimary = sameLocationNonTech.length > 0 ? sameLocationNonTech : nonTechJobs;

    const techHistory = takeDistinctJobs(rng, techPrimary, techJobs, techSlots, used);
    const nonTechHistory = takeDistinctJobs(rng, nonTechPrimary, nonTechJobs, nonTechSlots, used);

    user.job_history = [...techHistory, ...nonTechHistory].map((job) => job.id);

    for (const jobId of user.job_history) {
      if (!allJobIds.has(jobId)) throw new Error(`Unknown job id assigned to ${user.id}: ${jobId}`);
    }
  }
}

function summarize(jobs, users) {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const techJobs = jobs.filter(isTechJob);
  const nonTechJobs = jobs.length - techJobs.length;
  const techJobCountsByLocation = countBy(techJobs, (job) => job.location);
  const topPositions = [...countBy(jobs, (job) => job.position).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20);

  let techUsers = 0;
  let mainLocationTechMismatches = 0;
  for (const user of users) {
    const resolvedJobs = user.job_history.map((id) => jobById.get(id)).filter(Boolean);
    const userTechJobs = resolvedJobs.filter(isTechJob);
    if (userTechJobs.length > 0) techUsers += 1;
    if (
      MAIN_LOCATION_SET.has(user.current_location) &&
      userTechJobs.some((job) => job.location !== user.current_location)
    ) {
      mainLocationTechMismatches += 1;
    }
  }

  if (mainLocationTechMismatches > 0) {
    throw new Error(
      `${mainLocationTechMismatches} main-location tech users received out-of-location tech jobs`,
    );
  }

  return {
    totalJobs: jobs.length,
    techJobs: techJobs.length,
    nonTechJobs,
    generatedTechJobs: jobs.filter((job) => job.id.startsWith(GENERATED_ID_PREFIX)).length,
    techJobsByLocation: [...techJobCountsByLocation.entries()].sort((a, b) => b[1] - a[1]),
    techUsers,
    techUserRatio: techUsers / users.length,
    topPositions,
  };
}

function printSummary(summary) {
  const mainCounts = MAIN_LOCATIONS.map(
    (location) => `${location}: ${summary.techJobsByLocation.find(([loc]) => loc === location)?.[1] ?? 0}`,
  );

  console.log("Diversified jobs dataset summary");
  console.log(`Total jobs: ${summary.totalJobs}`);
  console.log(
    `Tech jobs: ${summary.techJobs} (${summary.generatedTechJobs} generated), non-tech jobs: ${summary.nonTechJobs}`,
  );
  console.log(`Tech users: ${summary.techUsers} (${(summary.techUserRatio * 100).toFixed(1)}%)`);
  console.log(`Main-location tech job counts: ${mainCounts.join("; ")}`);
  console.log("Tech jobs by location:");
  for (const [location, count] of summary.techJobsByLocation) {
    console.log(`  ${location}: ${count}`);
  }
  console.log("Top 20 positions:");
  for (const [position, count] of summary.topPositions) {
    console.log(`  ${position}: ${count}`);
  }
}

const rawJobs = JSON.parse(readFileSync(jobsPath, "utf8"));
const users = JSON.parse(readFileSync(usersPath, "utf8"));
const baseJobs = rawJobs.filter((job) => !job.id.startsWith(GENERATED_ID_PREFIX));
const generatedJobs = generateTechJobs(baseJobs);
const jobs = [...baseJobs, ...generatedJobs];

rebuildUserHistories(users, jobs);

writeFileSync(jobsPath, `${JSON.stringify(jobs, null, 4)}\n`);
writeFileSync(usersPath, `${JSON.stringify(users, null, 4)}\n`);

printSummary(summarize(jobs, users));
