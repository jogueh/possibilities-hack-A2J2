import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateTalkingPoint } from '@/lib/talkingPoints'

// POST /api/node/talking-points
// Request body (validated by the schema below) is forwarded to
// `generateTalkingPoint`, which always resolves to `{ tip: string }` (never
// throws, falls back deterministically on LLM failure or missing API key).

const requestSchema = z.object({
  goalRaw: z.string().min(1),
  viewerSummary: z.string().min(1),
  targetSummary: z.string().min(1),
  sharedContext: z
    .array(
      z.object({
        type: z.enum(['school', 'company', 'skill', 'location']),
        label: z.string().min(1),
      }),
    )
    .default([]),
  // New optional context fields — when supplied the LLM can produce more
  // grounded, specific tip variants (target's name lets it address them
  // directly; location/posts give the activity-anchored variant something
  // concrete to reference).
  targetName: z.string().min(1).optional(),
  targetLocation: z.string().min(1).optional(),
  targetPosts: z.array(z.string().min(1)).max(5).optional(),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const result = await generateTalkingPoint(parsed.data)
  return NextResponse.json(result)
}
