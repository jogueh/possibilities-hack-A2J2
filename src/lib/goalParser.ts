import { z } from 'zod'
import { generateObject } from 'ai'
import {
  getOpenRouterModel,
  hasOpenRouterKey,
  LLM_TIMEOUT_MS,
  OPENROUTER_MODEL,
} from '@/lib/openrouter'
import type { ParsedGoal } from '@/types/goal'

// =============================================================================
// Goal parser
// =============================================================================
// Path A (LLM): OpenRouter via Vercel AI SDK using structured JSON output mode.
// The LLM emits the multi-value `target*s` arrays (expanding regional / role
// concepts), optional exclusion lists for implicit "not this" phrasing
// ("west coast" → excludeLocations: east-coast cities), free-form `concepts`
// tags, and optional per-query `weightOverrides` that rebalance the scorer for
// the specific query intent (e.g. "find people in SF" → bump `location`).
//
// Path B (fallback): deterministic keyword scan over the known role/industry/
// location vocabulary in the dataset. Used when OPENROUTER_API_KEY is unset,
// the network fails, the request times out, or the LLM returns unparsable JSON.
// The fallback only populates the structured fields it can identify; the LLM
// path produces much richer ParsedGoal payloads.
//
// The endpoint never throws — callers always get a valid ParsedGoal.
// =============================================================================

// Re-exported for backwards compatibility with existing tests / imports.
export { LLM_TIMEOUT_MS }
export const GOAL_PARSER_MODEL = OPENROUTER_MODEL

// Weight override schema — every key optional + bounded so the LLM can't
// destabilize scoring with extreme values. Defaults live in @/lib/scoring.
const weightOverridesSchema = z
  .object({
    role: z.number().min(0).max(100).optional(),
    industry: z.number().min(0).max(100).optional(),
    location: z.number().min(0).max(100).optional(),
    skills: z.number().min(0).max(100).optional(),
    activity: z.number().min(0).max(100).optional(),
  })
  .optional()

const goalSchema = z.object({
  // Multi-value canonical fields — the LLM is asked to populate these.
  targetRoles: z.array(z.string()).optional(),
  targetIndustries: z.array(z.string()).optional(),
  targetLocations: z.array(z.string()).optional(),
  excludeRoles: z.array(z.string()).optional(),
  excludeIndustries: z.array(z.string()).optional(),
  excludeLocations: z.array(z.string()).optional(),
  concepts: z.array(z.string()).optional(),
  weightOverrides: weightOverridesSchema,
  // Singular deprecated aliases — accepted so older LLM responses or future
  // model regressions still parse, but the prompt steers the model toward the
  // plural fields.
  targetRole: z.string().optional(),
  targetIndustry: z.string().optional(),
  targetLocation: z.string().optional(),
})

// ---------- Vocabulary used by the fallback extractor ----------
// These mirror the static hackathon dataset. Synonyms map common shorthand
// (e.g. "SWE" -> "Software Engineer", "Tech" -> "Technology") to the canonical
// dataset value, so the fallback returns values the scorer can match on.

const KNOWN_ROLES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Software Engineer', aliases: ['software engineer', 'swe', 'software developer', 'developer'] },
  { canonical: 'Data Scientist', aliases: ['data scientist', 'data science', 'ml engineer', 'machine learning'] },
  { canonical: 'Product Manager', aliases: ['product manager', 'pm'] },
  {
    canonical: "UX Designer",
    aliases: [
      "ux designer",
      "ux",
      "designer",
      "user experience",
      "design",
      "design job",
      "product designer",
      "ui designer",
    ],
  },
  { canonical: 'DevOps Engineer', aliases: ['devops', 'site reliability', 'sre'] },
  { canonical: 'Marketing Specialist', aliases: ['marketing'] },
  { canonical: 'Financial Analyst', aliases: ['financial analyst', 'finance analyst'] },
  { canonical: 'Sales Representative', aliases: ['sales rep', 'sales representative', 'sales'] },
  { canonical: 'HR Coordinator', aliases: ['hr coordinator', 'human resources', 'recruiter', 'recruiting'] },
  { canonical: 'Customer Service Manager', aliases: ['customer service', 'customer success', 'support manager'] },
]

const KNOWN_INDUSTRIES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Technology', aliases: ['technology', 'tech', 'software', 'saas'] },
  { canonical: 'Finance', aliases: ['finance', 'fintech', 'banking', 'investment'] },
  { canonical: 'Healthcare', aliases: ['healthcare', 'health', 'medical', 'biotech'] },
  { canonical: 'Retail', aliases: ['retail', 'e-commerce', 'ecommerce'] },
  { canonical: 'Education', aliases: ['education', 'edtech', 'edu'] },
]

const KNOWN_LOCATIONS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'San Francisco, CA', aliases: ['san francisco', 'sf', 'bay area', 'silicon valley', 'mountain view', 'palo alto'] },
  { canonical: 'Seattle, WA', aliases: ['seattle'] },
  { canonical: 'New York, NY', aliases: ['new york', 'nyc', 'manhattan', 'brooklyn'] },
  { canonical: 'Austin, TX', aliases: ['austin'] },
  { canonical: 'Boston, MA', aliases: ['boston', 'cambridge, ma'] },
]

function findCanonical(
  text: string,
  vocab: Array<{ canonical: string; aliases: string[] }>,
): string | undefined {
  const lowered = text.toLowerCase()
  for (const entry of vocab) {
    for (const alias of entry.aliases) {
      // Leading word-boundary check so e.g. "tech" inside "biotech" does NOT
      // match. We intentionally DO NOT enforce a trailing boundary, so plurals
      // and gerunds (e.g. "managers", "engineering") still match their canonical
      // singular form.
      const idx = lowered.indexOf(alias)
      if (idx === -1) continue
      const before = idx === 0 ? '' : lowered[idx - 1]
      const isWordChar = (c: string) => /[a-z0-9]/.test(c)
      if (!isWordChar(before)) {
        return entry.canonical
      }
    }
  }
  return undefined
}

export function parseGoalFallback(raw: string): ParsedGoal {
  const targetRole = findCanonical(raw, KNOWN_ROLES)
  const targetIndustry = findCanonical(raw, KNOWN_INDUSTRIES)
  const targetLocation = findCanonical(raw, KNOWN_LOCATIONS)
  // Populate BOTH the plural arrays (canonical surface) and the singular
  // aliases (backwards-compat) so consumers that read either keep working.
  return {
    intent: raw,
    ...(targetRole ? { targetRole, targetRoles: [targetRole] } : {}),
    ...(targetIndustry
      ? { targetIndustry, targetIndustries: [targetIndustry] }
      : {}),
    ...(targetLocation
      ? { targetLocation, targetLocations: [targetLocation] }
      : {}),
  }
}

/**
 * Strips salary terminology from `raw` before it is embedded into an LLM
 * prompt. Removes:
 *   - the literal word `salary` (case-insensitive)
 *   - dollar amounts like `$200`, `$200k`, `$200,000`
 *   - numeric ranges like `50000-80000` or `50000–80000`
 * Whitespace is collapsed afterwards so the prompt stays readable.
 */
export function scrubForPrompt(raw: string): string {
  return raw
    .replace(/\$[\d,]+(?:\.\d+)?k?/gi, '')
    .replace(/\b\d{4,}\s*[-–]\s*\d{4,}\b/g, '')
    .replace(/\bsalary\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildPrompt(raw: string): string {
  // NOTE: raw is scrubbed of salary terminology so that no salary string can
  // be echoed back to the LLM even if the user types one in. Asserted in unit
  // tests (`does not include any salary terminology in the prompt`).
  const scrubbed = scrubForPrompt(raw)
  return [
    'You extract a structured search filter from a free-text career goal.',
    'Return ONLY a JSON object matching the schema. Omit fields you cannot infer.',
    '',
    `User goal: """${scrubbed}"""`,
    '',
    'Rules:',
    '1. EXPAND regional or category concepts into the concrete values they imply.',
    '   - "west coast" → targetLocations: ["San Francisco, CA", "Seattle, WA", "Portland, OR", "Los Angeles, CA", "San Diego, CA"]',
    '   - "bay area"   → targetLocations: ["San Francisco, CA", "Mountain View, CA", "Palo Alto, CA", "Oakland, CA"]',
    '   - "east coast" → targetLocations: ["New York, NY", "Boston, MA", "Washington, DC", "Philadelphia, PA"]',
    '   - "ML"         → targetRoles: ["Machine Learning Engineer", "Data Scientist", "ML Researcher"]',
    '   - "fintech"    → targetIndustries: ["Finance", "Banking", "Payments"]',
    '   Always emit the plural target*s arrays. Singular target* fields are deprecated.',
    '',
    '2. SURFACE implicit exclusions.',
    '   - "west coast jobs" implies excludeLocations: ["New York, NY", "Boston, MA", "Chicago, IL", "Washington, DC"]',
    '   - "individual contributor, not a manager" → excludeRoles: ["Manager", "Director", "VP"]',
    '   - "non-finance" → excludeIndustries: ["Finance"]',
    '',
    '3. EMIT concept tags for anything that does not fit the structured slots:',
    '   "remote", "startup", "senior", "open-source", "early-stage", "scale-up", "non-profit", ...',
    '   These get bonus-matched against candidate skills + posts.',
    '',
    '4. REBALANCE the scorer with weightOverrides when the user emphasizes a',
    '   specific signal. The default weights are role:35, industry:20, location:20,',
    '   skills:15, activity:10 (sum 100).',
    '   - "find people in SF" (location-driven) → { location: 50, role: 20, industry: 10 }',
    '   - "find ML engineers"  (role-driven)    → { role: 50, location: 10, industry: 15 }',
    '   - "fintech connections" (industry)      → { industry: 40, role: 25 }',
    '   - Goals with no emphasis → omit weightOverrides entirely.',
    '   Values are clamped to [0, 100]; they do NOT need to sum to 100.',
    '',
    '5. NEVER infer or output compensation, pay, or company-size info.',
  ].join('\n')
}

async function runLLM(raw: string): Promise<ParsedGoal | null> {
  if (!hasOpenRouterKey()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const { object } = await generateObject({
      model: getOpenRouterModel(),
      schema: goalSchema,
      prompt: buildPrompt(raw),
      abortSignal: controller.signal,
    })
    // Backfill the deprecated singular aliases from the plural arrays when
    // the LLM only emitted the plural form. Lets consumers that haven't
    // migrated (e.g. `filterRelevantJobs`) keep reading either field.
    const merged: ParsedGoal = { ...object, intent: raw }
    if (!merged.targetRole && merged.targetRoles?.[0]) {
      merged.targetRole = merged.targetRoles[0]
    }
    if (!merged.targetIndustry && merged.targetIndustries?.[0]) {
      merged.targetIndustry = merged.targetIndustries[0]
    }
    if (!merged.targetLocation && merged.targetLocations?.[0]) {
      merged.targetLocation = merged.targetLocations[0]
    }
    return merged
  } catch (e) {
    // Visible-on-fallback: surface upstream errors (rate limits, timeouts,
    // malformed JSON) in the server log so the operator can tell the LLM was
    // attempted rather than silently skipped.
    console.warn(
      '[goalParser] LLM call failed, using keyword fallback:',
      (e as Error)?.message ?? e,
    )
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function parseGoal(raw: string): Promise<ParsedGoal> {
  const llmResult = await runLLM(raw)
  if (llmResult) return llmResult
  return parseGoalFallback(raw)
}
