import { NextResponse } from 'next/server'
import { z } from 'zod'
import { fetchJobs, resolveUserWithJobs } from '@/lib/data'
import { parseGoal } from '@/lib/goalParser'
import { buildJobMatches } from '@/lib/jobMatches'
import type { UserWithJobs } from '@/types/data'
import type { JobMatch } from '@/types/job'

// POST /api/jobs/matches
// Request:  { goal: string, userIds: string[] }
// Response: { matches: JobMatch[] }
// Consumed by the Jobs Panel and canvas job-overlap decorations.

const requestSchema = z.object({
  goal: z.string().min(1, 'goal is required'),
  userIds: z.array(z.string().min(1)),
})

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { goal, userIds } = parsed.data
  // `fetchJobs` is the single shared jobs cache also used by
  // `resolveUserWithJobs` -> `resolveJobs`, so the jobs surfacing in matches
  // come from the same dataset as the ones populating `user.job_history`.
  const [parsedGoal, resolvedUsers, jobs] = await Promise.all([
    parseGoal(goal),
    Promise.all(userIds.map((id) => resolveUserWithJobs(id))),
    fetchJobs(),
  ])
  const webUsers: UserWithJobs[] = resolvedUsers.filter(
    (u): u is UserWithJobs => u !== null,
  )
  const matches: JobMatch[] = buildJobMatches(jobs, webUsers, parsedGoal)

  return NextResponse.json({ matches })
}
