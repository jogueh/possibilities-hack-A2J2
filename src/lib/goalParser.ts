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
// Path B (fallback): deterministic keyword scan over the known role/industry/
// location vocabulary in the dataset. Used when OPENROUTER_API_KEY is unset,
// the network fails, the request times out, or the LLM returns unparsable JSON.
//
// The endpoint never throws — callers always get a valid ParsedGoal.
// =============================================================================

// Re-exported for backwards compatibility with existing tests / imports.
export { LLM_TIMEOUT_MS }
export const GOAL_PARSER_MODEL = OPENROUTER_MODEL

const goalSchema = z.object({
  targetRole: z.string().optional(),
  targetIndustry: z.string().optional(),
  targetLocation: z.string().optional(),
})

// ---------- Vocabulary used by the fallback extractor ----------
// These mirror the static hackathon dataset. Synonyms map common shorthand
// (e.g. "SWE" -> "Software Engineer", "Tech" -> "Technology") to the canonical
// dataset value, so the fallback returns values the scorer can match on.

const KNOWN_ROLES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Software Engineer', aliases: ['software engineer', 'swe', 'software developer', 'developer', 'engineer'] },
  { canonical: 'Data Scientist', aliases: ['data scientist', 'data science', 'ml engineer', 'machine learning'] },
  { canonical: 'Product Manager', aliases: ['product manager', 'pm'] },
  { canonical: 'UX Designer', aliases: ['ux designer', 'ux', 'designer', 'user experience'] },
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
  return {
    intent: raw,
    ...(targetRole ? { targetRole } : {}),
    ...(targetIndustry ? { targetIndustry } : {}),
    ...(targetLocation ? { targetLocation } : {}),
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
    'Extract the user\'s career goal into structured fields.',
    'Return ONLY a JSON object matching the schema; if a field is unknown, omit it.',
    '',
    `User goal: """${scrubbed}"""`,
    '',
    'Examples of valid values:',
    '- targetRole: "Software Engineer", "Product Manager", "Data Scientist"',
    '- targetIndustry: "Technology", "Finance", "Healthcare"',
    '- targetLocation: "San Francisco, CA", "New York, NY", "Austin, TX"',
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
    return { ...object, intent: raw }
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
