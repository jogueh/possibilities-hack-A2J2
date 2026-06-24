import { NextResponse } from 'next/server'
import { resolveUserWithJobs } from '@/lib/data'

// GET /api/user/[userId]
// Returns a fully-resolved UserWithJobs (job_history string[] is replaced with
// Job[]). Consumed by W3 (sidebar) and W4 (career timeline).
//
// NOTE TO CONSUMERS: the raw payload INCLUDES salary_range on each job record
// because it is the canonical data shape. Consumers (W3 / W4) MUST strip salary
// data before rendering or sending to any LLM. This route is the documented
// contract boundary; salary stripping is enforced at the render / prompt layer.

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await context.params
  const user = await resolveUserWithJobs(userId)
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }
  return NextResponse.json(user)
}
