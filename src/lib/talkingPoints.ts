import { z } from 'zod'
import { generateObject } from 'ai'
import {
  getOpenRouterModel,
  hasOpenRouterKey,
  LLM_TIMEOUT_MS,
} from '@/lib/openrouter'
import type {
  TalkingPointsRequest,
  TalkingPointsResponse,
} from '@/types/talkingPoints'

// =============================================================================
// Talking-points generator
// =============================================================================
// Drafts up to 3 distinct outreach openers for a target connection so the
// viewer can pick the angle that fits the moment. Consumed by W3's sidebar:
// the first tip pre-fills the InMail subject; the others render as alternate
// suggestions.
//
// Each variant is anchored on a DIFFERENT signal so they aren't paraphrases:
//   1. Shared background  (school / past employer / shared skill / city)
//   2. Target's recent activity or current role
//   3. Advice-seeking on the viewer's stated goal
// The LLM is instructed to honour this split; the deterministic fallback
// reproduces the same three slots from local data when the LLM is
// unavailable.
//
// The LLM call is bounded:
//   - 5s timeout via AbortController
//   - Silent skip when OPENROUTER_API_KEY is unset
//   - On any failure, returns deterministic fallbacks built from the
//     supplied context
//
// Salary hygiene: the handler regex-scrubs `$amounts`, numeric ranges, and the
// literal word "compensation" or "salary" from every free-text field BEFORE
// the prompt is built. W3 is also expected to strip salary upstream; this is
// defense in depth so a bug in either layer can't leak salary to the LLM.
// =============================================================================

const MAX_TIPS = 3

// LLM responds with a `tips: string[]` array — exactly the same shape we
// return. We backfill `tip = tips[0]` after the fact so consumers that read
// the singular field keep working.
const tipsSchema = z.object({
  tips: z.array(z.string().min(1)).min(1),
})

/**
 * Strips salary terminology from text headed into an LLM prompt. Removes:
 *   - `$200`, `$200k`, `$200,000`
 *   - numeric ranges like `50000-80000` or `50000–80000`
 *   - the literal word `salary` (case-insensitive)
 * Whitespace is collapsed afterwards so the prompt stays readable.
 */
export function scrubSalary(text: string): string {
  return text
    .replace(/\$[\d,]+(?:\.\d+)?k?/gi, '')
    .replace(/\b\d{4,}\s*[-–]\s*\d{4,}\b/g, '')
    .replace(/\bsalary\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clean(text: string | undefined): string {
  return text ? scrubSalary(text) : ''
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks — produced when the LLM is unavailable or fails.
// One per "angle" so the user gets meaningful variety even without an LLM.
// Returns at most MAX_TIPS strings; the first is also the singular `tip`.
// ---------------------------------------------------------------------------

function fallbackFromSharedContext(req: TalkingPointsRequest): string | null {
  const top = req.sharedContext[0]
  if (!top) return null
  return `Mention your shared ${top.type} (${top.label}).`
}

function fallbackFromActivityOrRole(req: TalkingPointsRequest): string | null {
  const post = req.targetPosts?.find((p) => p && p.trim().length > 0)
  const name = req.targetName ? ` ${req.targetName}` : ''
  if (post) {
    return `Reference${name}'s recent post — "${scrubSalary(post).slice(0, 80)}" — and ask what prompted it.`
  }
  const role = clean(req.targetSummary).split(';')[0]?.trim()
  if (role) {
    return `Ask${name} about their experience as ${role.replace(/\.$/, '')}.`
  }
  return null
}

function fallbackFromGoal(req: TalkingPointsRequest): string | null {
  const goal = clean(req.goalRaw)
  if (!goal) return null
  const name = req.targetName ? ` ${req.targetName}` : ''
  return `Briefly share your goal — "${goal.slice(0, 80)}" — and ask${name} for one piece of advice.`
}

function fallbackFromLocation(req: TalkingPointsRequest): string | null {
  if (!req.targetLocation) return null
  const city = req.targetLocation.split(',')[0]?.trim()
  if (!city) return null
  return `Open with the ${city} connection — ask what the local ${
    req.sharedContext.find((c) => c.type === 'company')?.label ?? 'tech'
  } scene has been like lately.`
}

function fallbackTips(req: TalkingPointsRequest): string[] {
  const candidates = [
    fallbackFromSharedContext(req),
    fallbackFromActivityOrRole(req),
    fallbackFromGoal(req),
    fallbackFromLocation(req),
  ].filter((t): t is string => !!t && t.trim().length > 0)
  const deduped: string[] = []
  for (const c of candidates) {
    if (!deduped.includes(c)) deduped.push(c)
    if (deduped.length >= MAX_TIPS) break
  }
  if (deduped.length === 0) {
    return ['Mention your shared interest in their industry.']
  }
  return deduped
}

// ---------------------------------------------------------------------------
// Prompt + LLM call
// ---------------------------------------------------------------------------

export function buildTalkingPointsPrompt(req: TalkingPointsRequest): string {
  // We scrub salary defensively even though W3 is expected to strip it
  // upstream. See module header for the rationale.
  const viewer = clean(req.viewerSummary)
  const target = clean(req.targetSummary)
  const goal = clean(req.goalRaw)
  const targetName = clean(req.targetName)
  const targetLocation = clean(req.targetLocation)
  const targetPosts = (req.targetPosts ?? [])
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 3)
  const shared =
    req.sharedContext.length === 0
      ? '(none)'
      : req.sharedContext
          .map((s) => `- ${s.type}: ${scrubSalary(s.label)}`)
          .join('\n')
  const recent =
    targetPosts.length === 0
      ? '(none)'
      : targetPosts.map((p) => `- "${p}"`).join('\n')

  return [
    'You are helping the viewer draft a warm, specific opener for a',
    'connection request or InMail. The viewer is trying to take ONE small',
    'step toward their stated goal — they are NOT pitching, NOT selling,',
    'NOT asking for a job, and NOT introducing themselves at length.',
    '',
    `Produce exactly ${MAX_TIPS} distinct openers, each anchored on a`,
    'DIFFERENT signal so the viewer can pick the angle that fits:',
    '  1. SHARED BACKGROUND — name a specific shared school/employer/skill',
    '     /city from the shared context. Skip this slot if nothing is shared.',
    '  2. RECENT ACTIVITY OR ROLE — react to a specific recent post by the',
    '     target, or ask about a specific aspect of their current role.',
    '  3. ADVICE-SEEKING — tie the opener to the viewer\'s goal and ask for',
    '     one concrete piece of advice or perspective.',
    '',
    'Constraints for every variant:',
    '  - ONE sentence, max two. Specific, not generic.',
    '  - No greetings ("Hi", "Hey"), no sign-offs ("Thanks", "Best"), no',
    '    self-introductions ("I\'m a..."), no compensation/pay/money talk.',
    '  - Use the target\'s name if provided.',
    '  - Reference at least one concrete detail from the context below per',
    '    variant (a specific company, school, post, location, or role).',
    '',
    `Goal: ${goal}`,
    `Viewer: ${viewer}`,
    `Target${targetName ? ` (${targetName})` : ''}: ${target}`,
    targetLocation ? `Target location: ${targetLocation}` : '',
    `Shared context:\n${shared}`,
    `Target's recent activity:\n${recent}`,
    '',
    `Return ONLY a JSON object: { "tips": ["<opener 1>", "<opener 2>", "<opener 3>"] }.`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export async function generateTalkingPoint(
  req: TalkingPointsRequest,
): Promise<TalkingPointsResponse> {
  if (!hasOpenRouterKey()) {
    const tips = fallbackTips(req)
    return { tip: tips[0], tips }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const { object } = await generateObject({
      model: getOpenRouterModel(),
      schema: tipsSchema,
      prompt: buildTalkingPointsPrompt(req),
      abortSignal: controller.signal,
    })
    const cleaned = (object.tips ?? [])
      .map((t) => t?.trim())
      .filter((t): t is string => !!t && t.length > 0)
      .slice(0, MAX_TIPS)
    if (cleaned.length === 0) {
      console.warn(
        '[talkingPoints] LLM returned no usable tips, using deterministic fallback',
      )
      const tips = fallbackTips(req)
      return { tip: tips[0], tips }
    }
    return { tip: cleaned[0], tips: cleaned }
  } catch (e) {
    // Visible-on-fallback: surface upstream errors so the operator can tell
    // the LLM was attempted rather than silently skipped.
    console.warn(
      '[talkingPoints] LLM call failed, using deterministic fallback:',
      (e as Error)?.message ?? e,
    )
    const tips = fallbackTips(req)
    return { tip: tips[0], tips }
  } finally {
    clearTimeout(timer)
  }
}
