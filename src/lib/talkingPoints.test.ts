import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({ generateObject: vi.fn() }))
vi.mock('@openrouter/ai-sdk-provider', () => {
  const chat = vi.fn((model: string) => ({ __mockModel: model }))
  const openrouter = Object.assign(chat, { chat })
  return { openrouter }
})

import { generateObject } from 'ai'
import {
  buildTalkingPointsPrompt,
  generateTalkingPoint,
  scrubSalary,
} from '@/lib/talkingPoints'
import type { TalkingPointsRequest } from '@/types/talkingPoints'

const generateObjectMock = vi.mocked(generateObject)

const baseRequest: TalkingPointsRequest = {
  goalRaw: 'find a Bay Area software engineering role',
  viewerSummary: 'New grad. Skills: TypeScript, React. Most recent: Intern at Acme.',
  targetSummary: 'Senior SWE at Stripe, San Francisco. Worked on payments infra.',
  sharedContext: [
    { type: 'school', label: 'Both attended UC Berkeley' },
    { type: 'skill', label: 'Both know TypeScript' },
  ],
  targetName: 'Sarah Chen',
  targetLocation: 'San Francisco, CA',
  targetPosts: ['Just shipped our new payments idempotency layer'],
}

describe('scrubSalary', () => {
  it('removes a $ amount with no thousands separator', () => {
    expect(scrubSalary('paying $120000 a year')).toBe('paying a year')
  })

  it('removes a $ amount with thousands separators and decimals', () => {
    expect(scrubSalary('comp: $250,000.50 annual')).toBe('comp: annual')
  })

  it('removes a $ amount with the k shorthand', () => {
    expect(scrubSalary('around $200k base')).toBe('around base')
  })

  it('removes numeric ranges (hyphen and en-dash)', () => {
    expect(scrubSalary('range 50000-80000 USD')).toBe('range USD')
    expect(scrubSalary('range 50000–80000 USD')).toBe('range USD')
  })

  it('removes the literal word salary (case-insensitive)', () => {
    expect(scrubSalary('asked about Salary expectations')).toBe(
      'asked about expectations',
    )
  })

  it('leaves non-financial text intact', () => {
    expect(scrubSalary('Senior SWE at Stripe, San Francisco.')).toBe(
      'Senior SWE at Stripe, San Francisco.',
    )
  })
})

describe('buildTalkingPointsPrompt', () => {
  it('scrubs salary from every free-text field before assembling the prompt', () => {
    const prompt = buildTalkingPointsPrompt({
      ...baseRequest,
      goalRaw: 'looking for a $300k role',
      viewerSummary: 'Skills: TypeScript. Salary expectations: $250,000.',
      targetSummary: 'SWE at Stripe. salary 200000-400000.',
      sharedContext: [{ type: 'company', label: 'salary at Acme: $80k' }],
      targetPosts: ['salary post $400k'],
    })
    expect(prompt.toLowerCase()).not.toContain('salary')
    expect(prompt).not.toContain('$')
    expect(prompt).not.toMatch(/\d{4,}\s*[-–]\s*\d{4,}/)
  })

  it('renders "(none)" when sharedContext is empty', () => {
    const prompt = buildTalkingPointsPrompt({
      ...baseRequest,
      sharedContext: [],
    })
    expect(prompt).toContain('Shared context:\n(none)')
  })

  it('includes the new richer context fields in the prompt when supplied', () => {
    const prompt = buildTalkingPointsPrompt(baseRequest)
    expect(prompt).toContain('Sarah Chen')
    expect(prompt).toContain('San Francisco, CA')
    expect(prompt).toContain('payments idempotency layer')
  })

  it('renders "(none)" for recent activity when targetPosts is absent', () => {
    const prompt = buildTalkingPointsPrompt({
      ...baseRequest,
      targetPosts: undefined,
    })
    expect(prompt).toContain("Target's recent activity:\n(none)")
  })

  it('explicitly asks for 3 distinct opener variants', () => {
    const prompt = buildTalkingPointsPrompt(baseRequest)
    expect(prompt).toMatch(/exactly 3 distinct openers/i)
    expect(prompt).toMatch(/tips/i)
  })
})

describe('generateTalkingPoint — LLM path', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    generateObjectMock.mockReset()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns the LLM tips on success (with tip = tips[0])', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        tips: [
          'Ask Sarah how Stripe approaches payment idempotency.',
          'Mention your shared UC Berkeley background.',
          'Share your goal of finding a Bay Area SWE role.',
        ],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    const res = await generateTalkingPoint(baseRequest)
    expect(res.tips).toHaveLength(3)
    expect(res.tip).toBe(res.tips[0])
    expect(res.tip).toMatch(/Stripe/)
  })

  it('caps the LLM response at 3 tips and drops empty entries', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        tips: ['First', '  ', 'Second', '', 'Third', 'Fourth', 'Fifth'],
      },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    const res = await generateTalkingPoint(baseRequest)
    expect(res.tips).toEqual(['First', 'Second', 'Third'])
  })

  it('sends the scrubbed (not raw) summaries to the prompt', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { tips: ['ok'] },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    await generateTalkingPoint({
      ...baseRequest,
      targetSummary: 'SWE at Stripe. salary $300,000.',
    })
    const call = generateObjectMock.mock.calls[0]?.[0] as { prompt: string }
    expect(call.prompt.toLowerCase()).not.toContain('salary')
    expect(call.prompt).not.toContain('$300,000')
  })

  it('falls back to deterministic tips on LLM error', async () => {
    generateObjectMock.mockRejectedValueOnce(new Error('upstream broke'))
    const res = await generateTalkingPoint(baseRequest)
    expect(res.tips.length).toBeGreaterThan(0)
    expect(res.tips[0]).toMatch(/Berkeley/)
  })

  it('falls back to deterministic tips on abort/timeout', async () => {
    generateObjectMock.mockImplementationOnce(async (opts: unknown) => {
      const { abortSignal } = opts as { abortSignal: AbortSignal }
      const err = new Error('aborted')
      err.name = 'AbortError'
      if (abortSignal.aborted) throw err
      throw err
    })
    const res = await generateTalkingPoint(baseRequest)
    expect(res.tip).toMatch(/Berkeley/)
  })

  it('falls back when the LLM returns no usable tips', async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { tips: ['   '] },
    } as unknown as Awaited<ReturnType<typeof generateObject>>)
    const res = await generateTalkingPoint(baseRequest)
    expect(res.tip).toMatch(/Berkeley/)
  })
})

describe('generateTalkingPoint — fallback path (no API key)', () => {
  const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY
    generateObjectMock.mockReset()
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY
  })

  it('returns multiple variants from the local context (no LLM call)', async () => {
    const res = await generateTalkingPoint(baseRequest)
    // First variant pulls from the top shared context.
    expect(res.tip).toBe(
      'Mention your shared school (Both attended UC Berkeley).',
    )
    // Plus at least one additional angle anchored on a different signal.
    expect(res.tips.length).toBeGreaterThan(1)
    expect(res.tips.some((t) => /Sarah Chen/.test(t))).toBe(true)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it('uses a generic industry-style fallback when nothing else is available', async () => {
    const res = await generateTalkingPoint({
      goalRaw: '',
      viewerSummary: 'n/a',
      targetSummary: '',
      sharedContext: [],
    })
    expect(res.tip).toMatch(/industry/)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it('first fallback variant is the shared-context one when available', async () => {
    const res = await generateTalkingPoint({
      goalRaw: 'find a PM role',
      viewerSummary: 'n/a',
      targetSummary: 'PM at Notion',
      sharedContext: [
        { type: 'company', label: 'Both worked at Acme' },
      ],
    })
    expect(res.tip).toBe('Mention your shared company (Both worked at Acme).')
  })
})
