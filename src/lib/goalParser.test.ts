import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Module mocks must come before importing the module under test.
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))
vi.mock('@openrouter/ai-sdk-provider', () => {
  const chat = vi.fn((model: string) => ({ __mockModel: model }))
  const openrouter = Object.assign(chat, { chat })
  return { openrouter }
})

import { generateObject } from 'ai'
import {
  GOAL_PARSER_MODEL,
  parseGoal,
  parseGoalFallback,
} from '@/lib/goalParser'

const generateObjectMock = vi.mocked(generateObject)

describe('parseGoalFallback (deterministic keyword extractor)', () => {
  it('extracts role + location from a typical goal string', () => {
    const r = parseGoalFallback(
      'I want to break into SWE in the San Francisco Bay Area',
    )
    expect(r.targetRole).toBe('Software Engineer')
    expect(r.targetLocation).toBe('San Francisco, CA')
    expect(r.intent).toContain('SWE')
  })

  it('extracts industry when present', () => {
    const r = parseGoalFallback('Find product managers in fintech in NYC')
    expect(r.targetRole).toBe('Product Manager')
    expect(r.targetIndustry).toBe('Finance')
    expect(r.targetLocation).toBe('New York, NY')
  })

  it('always returns a valid ParsedGoal with intent for empty / nonsense input', () => {
    const r = parseGoalFallback('asdjkfhasldkfj')
    expect(r.intent).toBe('asdjkfhasldkfj')
    expect(r.targetRole).toBeUndefined()
    expect(r.targetIndustry).toBeUndefined()
    expect(r.targetLocation).toBeUndefined()
  })

  it('returns intent for an empty string', () => {
    const r = parseGoalFallback('')
    expect(r.intent).toBe('')
  })

  it('does not match "tech" inside the substring "biotech" (word-boundary check)', () => {
    const r = parseGoalFallback('I am a biotech researcher')
    expect(r.targetIndustry).toBe('Healthcare')
  })

  it('returns the canonical dataset value, not the alias', () => {
    const r = parseGoalFallback('looking for SWE roles in tech')
    expect(r.targetRole).toBe('Software Engineer')
    expect(r.targetIndustry).toBe('Technology')
  })
})

describe('parseGoal (LLM path with mocked generateObject)', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    generateObjectMock.mockReset()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns the LLM-extracted fields plus the original intent', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        targetRole: 'Product Manager',
        targetIndustry: 'Technology',
        targetLocation: 'Seattle, WA',
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)

    const r = await parseGoal('I want a PM role at a Seattle SaaS company')
    expect(r.targetRole).toBe('Product Manager')
    expect(r.targetIndustry).toBe('Technology')
    expect(r.targetLocation).toBe('Seattle, WA')
    expect(r.intent).toBe('I want a PM role at a Seattle SaaS company')
  })

  it('uses the configured free OpenRouter model', async () => {
    // Accept either a pinned ':free' variant (e.g. 'meta-llama/llama-3.3-70b-instruct:free')
    // or the 'openrouter/free' auto-router. Both keep us on the free tier.
    expect(GOAL_PARSER_MODEL).toMatch(/(?::|\/)free$/)
    generateObjectMock.mockResolvedValueOnce({
      object: {},
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    await parseGoal('any goal')
    const call = generateObjectMock.mock.calls[0]?.[0] as { model: unknown }
    expect((call.model as { __mockModel: string }).__mockModel).toMatch(/(?::|\/)free$/)
  })

  it('falls back to keyword extractor on LLM error', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('rate limited'))
    const r = await parseGoal('looking for software engineer roles in austin')
    expect(r.targetRole).toBe('Software Engineer')
    expect(r.targetLocation).toBe('Austin, TX')
  })

  it('skips the LLM entirely when OPENROUTER_API_KEY is unset', async () => {
    delete process.env.OPENROUTER_API_KEY
    const r = await parseGoal('data scientist in nyc')
    expect(generateObjectMock).not.toHaveBeenCalled()
    expect(r.targetRole).toBe('Data Scientist')
    expect(r.targetLocation).toBe('New York, NY')
  })

  it('does not include any salary terminology in the prompt sent to the LLM', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {},
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    await parseGoal('I want a $200k SWE role')
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt: string }
    expect(call.prompt.toLowerCase()).not.toContain('salary')
    expect(call.prompt).not.toContain('$')
  })

  it('falls back if the LLM call is aborted', async () => {
    generateObjectMock.mockImplementationOnce(async (opts: unknown) => {
      const { abortSignal } = opts as { abortSignal: AbortSignal }
      const err = new Error('aborted')
      err.name = 'AbortError'
      if (abortSignal.aborted) throw err
      throw err
    })
    const r = await parseGoal('product manager in austin')
    expect(r.targetRole).toBe('Product Manager')
    expect(r.targetLocation).toBe('Austin, TX')
  })

  it('preserves array fields (targetRoles, targetLocations, excludes, concepts, weightOverrides)', async () => {
    // The big win of the new schema: the LLM can EXPAND "west coast" to a
    // list of cities and surface the implicit east-coast exclusion AND
    // rebalance the scorer to weight location more.
    generateObjectMock.mockResolvedValueOnce({
      object: {
        targetRoles: ['Software Engineer', 'Machine Learning Engineer'],
        targetIndustries: ['Technology'],
        targetLocations: [
          'San Francisco, CA',
          'Seattle, WA',
          'Portland, OR',
          'Los Angeles, CA',
        ],
        excludeLocations: ['New York, NY', 'Boston, MA'],
        concepts: ['startup', 'remote-friendly'],
        weightOverrides: { location: 40, role: 30 },
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)

    const r = await parseGoal('SWE or ML west coast startup')
    expect(r.targetRoles).toEqual([
      'Software Engineer',
      'Machine Learning Engineer',
    ])
    expect(r.targetLocations).toEqual([
      'San Francisco, CA',
      'Seattle, WA',
      'Portland, OR',
      'Los Angeles, CA',
    ])
    expect(r.excludeLocations).toEqual(['New York, NY', 'Boston, MA'])
    expect(r.concepts).toEqual(['startup', 'remote-friendly'])
    expect(r.weightOverrides).toEqual({ location: 40, role: 30 })
    // Backwards-compat: singular aliases get backfilled from the first
    // entry of each plural so older consumers (`filterRelevantJobs`) keep
    // matching.
    expect(r.targetRole).toBe('Software Engineer')
    expect(r.targetIndustry).toBe('Technology')
    expect(r.targetLocation).toBe('San Francisco, CA')
  })
})
