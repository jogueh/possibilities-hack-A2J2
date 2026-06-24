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
// Drafts a 1–2 sentence personalised outreach opener for a target connection.
// Consumed by W3's sidebar; W3 only renders the returned `{ tip }` string.
//
// The LLM call is bounded:
//   - 5s timeout via AbortController
//   - Silent skip when OPENROUTER_API_KEY is unset
//   - On any failure, returns a deterministic fallback string built from the
//     top SharedContext entry
//
// Salary hygiene: the handler regex-scrubs `$amounts`, numeric ranges, and the
// literal word "salary" from both `viewerSummary` and `targetSummary` BEFORE
// the prompt is built. W3 is also expected to strip salary upstream; this is
// defense in depth so a bug in either layer can't leak salary to the LLM.
// =============================================================================

const tipSchema = z.object({ tip: z.string() })

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

function fallbackTip(req: TalkingPointsRequest): string {
  const top = req.sharedContext[0]
  if (top) return `Mention your shared ${top.type} (${top.label}).`
  return 'Mention your shared interest in their industry.'
}

export function buildTalkingPointsPrompt(req: TalkingPointsRequest): string {
  // We scrub salary defensively even though W3 is expected to strip it
  // upstream. See module header for the rationale.
  const viewer = scrubSalary(req.viewerSummary)
  const target = scrubSalary(req.targetSummary)
  const goal = scrubSalary(req.goalRaw)
  const shared =
    req.sharedContext.length === 0
      ? '(none)'
      : req.sharedContext
          .map((s) => `- ${s.type}: ${scrubSalary(s.label)}`)
          .join('\n')
  return [
    'You are helping the viewer draft a warm outreach message opener.',
    'Write ONE sentence (max two) the viewer could send to the target.',
    'Be specific. Anchor on at least one shared context entry if any exist.',
    'Do NOT mention compensation, pay, or money. Do not greet ("Hi", "Hey")',
    'or sign off — just the opener content itself.',
    '',
    `Goal: ${goal}`,
    `Viewer: ${viewer}`,
    `Target: ${target}`,
    `Shared context:\n${shared}`,
    '',
    'Return ONLY a JSON object: { "tip": "<one sentence>" }.',
  ].join('\n')
}

export async function generateTalkingPoint(
  req: TalkingPointsRequest,
): Promise<TalkingPointsResponse> {
  if (!hasOpenRouterKey()) return { tip: fallbackTip(req) }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  try {
    const { object } = await generateObject({
      model: getOpenRouterModel(),
      schema: tipSchema,
      prompt: buildTalkingPointsPrompt(req),
      abortSignal: controller.signal,
    })
    const tip = object.tip?.trim()
    if (!tip) return { tip: fallbackTip(req) }
    return { tip }
  } catch {
    return { tip: fallbackTip(req) }
  } finally {
    clearTimeout(timer)
  }
}
