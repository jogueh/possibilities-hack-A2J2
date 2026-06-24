// Diversify the `company`, `position`, and `description` fields of
// `src/data/jobs_data.json` IN PLACE so the demo's job postings read like real
// LinkedIn listings instead of repeating ~5 companies and 10 positions.
//
// Hard rules (keep the data joinable + schema intact):
//   - PRESERVED byte-for-byte: `id`, `location`, `salary_range`, `industry`,
//     `level`, `easy_apply`.
//   - Only `company`, `position`, and `description` are rewritten. `description`
//     is regenerated from the same templates as the original data so it always
//     mentions the (new) position / industry consistently.
//   - `position` is drawn from an industry-aware pool so titles fit each
//     posting's `industry` (plus a shared cross-functional pool).
//   - Deterministic + idempotent: every choice is seeded by the job `id`, so
//     re-running produces identical output.
//
// Usage:  node scripts/diversify-jobs.mjs
//
// NOTE: after running this, regenerate the inlined `headline` values in
// `src/data/web_people.ts` (each is `position at company` for that member's
// first resolvable job) so the canvas nodes still match the NodeSidebar.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");

// ── Deterministic PRNG seeded per-job by id ──────────────────────────────────
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

// ── Value pools ──────────────────────────────────────────────────────────────
// Diverse, realistic-sounding (fictional) employers across sectors.
const COMPANIES = [
  "Innovatech", "FutureWorks", "AI Dynamics", "Global Solutions LLC",
  "Tech Innovators Inc.", "Northwind Technologies", "Brightpath Health",
  "Summit Financial Group", "Evergreen Retail Co.", "Lumina Labs",
  "Meridian Analytics", "Cobalt Software", "Riverstone Capital",
  "Vantage Health Systems", "Pinnacle Education Group", "Quantum Logic",
  "Helix Biosciences", "Cedar & Co.", "Atlas Logistics", "Beacon Consulting",
  "Orchid Pharmaceuticals", "Granite Bank", "Skyline Media", "Verdant Energy",
  "Harborview Partners", "Nimbus Cloud", "Sterling Wealth Management",
  "Maplewood Schools", "Crimson Robotics", "Aurora Networks",
  "Ironclad Security", "Fairmont Retail Group", "Polaris Ventures",
  "Sequoia Diagnostics", "Keystone Manufacturing", "Trailhead Software",
];

// Cross-functional roles that fit any industry.
const COMMON_ROLES = [
  "Marketing Specialist", "Marketing Manager", "HR Coordinator",
  "HR Business Partner", "Recruiter", "Operations Analyst", "Project Manager",
  "Business Analyst", "Customer Service Manager", "Communications Manager",
  "Data Analyst", "Sales Representative", "Account Executive", "Office Manager",
  "Executive Assistant",
];

// Industry-specific roles, merged with COMMON_ROLES at pick time.
const ROLES_BY_INDUSTRY = {
  Technology: [
    "Software Engineer", "Senior Software Engineer", "Frontend Engineer",
    "Backend Engineer", "Full Stack Developer", "DevOps Engineer",
    "Site Reliability Engineer", "Data Scientist", "Machine Learning Engineer",
    "Data Engineer", "Product Manager", "Engineering Manager", "QA Engineer",
    "Security Engineer", "Cloud Architect", "Mobile Developer", "UX Designer",
    "UI Designer", "Solutions Architect", "Technical Program Manager",
  ],
  Finance: [
    "Financial Analyst", "Senior Financial Analyst", "Investment Analyst",
    "Portfolio Manager", "Risk Analyst", "Accountant", "Auditor",
    "Financial Advisor", "Investment Banking Associate", "Actuary",
    "Compliance Officer", "Treasury Analyst", "Equity Research Analyst",
    "Quantitative Analyst", "Controller", "Tax Manager",
  ],
  Healthcare: [
    "Registered Nurse", "Nurse Practitioner", "Physician Assistant",
    "Clinical Research Associate", "Medical Technologist",
    "Healthcare Administrator", "Pharmacist", "Physical Therapist",
    "Medical Coder", "Clinical Data Manager", "Health Informatics Specialist",
    "Biomedical Engineer", "Care Coordinator", "Public Health Analyst",
  ],
  Retail: [
    "Store Manager", "Retail Buyer", "Merchandising Manager",
    "Supply Chain Analyst", "Logistics Coordinator", "Category Manager",
    "Visual Merchandiser", "E-commerce Manager", "Inventory Planner",
    "Customer Experience Manager", "Regional Sales Manager",
    "Operations Manager", "Brand Manager",
  ],
  Education: [
    "Curriculum Developer", "Instructional Designer", "Academic Advisor",
    "Education Program Manager", "Research Coordinator", "Admissions Counselor",
    "Learning Experience Designer", "School Administrator",
    "Education Consultant", "Training Specialist", "EdTech Product Manager",
  ],
};

// Description templates from the original dataset; {pos}/{ind} get filled in.
const TEMPLATES = [
  (pos, ind) => `Looking for a ${pos} with a passion for ${ind} to join our team.`,
  (pos, ind) => `Join our team as a ${pos} and help us innovate in the ${ind} industry.`,
  (pos) => `We need a talented ${pos} to help us build and maintain our products.`,
  (pos) => `We need a talented ${pos} to help us manage and optimize our operations.`,
  (pos, ind) => `Become a part of our team as a ${pos} and contribute to our growth in the ${ind} sector.`,
  (pos, ind) => `Become a part of our team as a ${pos} and contribute to our projects in the ${ind} sector.`,
];

// ── Rewrite ──────────────────────────────────────────────────────────────────
const jobs = JSON.parse(readFileSync(join(dataDir, "jobs_data.json"), "utf8"));

for (const job of jobs) {
  const rng = rngFor(job.id);

  job.company = pick(rng, COMPANIES);

  const industryRoles = ROLES_BY_INDUSTRY[job.industry] ?? [];
  const rolePool = [...industryRoles, ...COMMON_ROLES];
  job.position = pick(rng, rolePool);

  job.description = pick(rng, TEMPLATES)(job.position, job.industry);

  // PRESERVED untouched: id, location, salary_range, industry, level, easy_apply.
}

writeFileSync(
  join(dataDir, "jobs_data.json"),
  JSON.stringify(jobs, null, 4) + "\n",
);

const companies = new Set(jobs.map((j) => j.company)).size;
const positions = new Set(jobs.map((j) => j.position)).size;
console.log(
  `Diversified ${jobs.length} jobs across ${companies} companies and ` +
    `${positions} positions. Preserved id/location/salary/industry/level/easy_apply.`,
);
