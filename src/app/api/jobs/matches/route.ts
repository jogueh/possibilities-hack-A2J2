import { NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveUserWithJobs } from '@/lib/data'
import { parseGoal } from '@/lib/goalParser'
import { buildJobMatches } from '@/lib/jobMatches'
import type { Job, UserWithJobs } from '@/types/data'
import type { JobMatch } from '@/types/job'

// POST /api/jobs/matches
// Request:  { goal: string, userIds: string[] }
// Response: { matches: JobMatch[] }
// Consumed by the Jobs Panel and canvas job-overlap decorations.

const requestSchema = z.object({
  goal: z.string().min(1, 'goal is required'),
  userIds: z.array(z.string().min(1)),
})

let jobsCache: Job[] | null = null

async function getJobs(): Promise<Job[]> {
  if (jobsCache) return jobsCache
  const { default: jobsData } = await import('@/data/jobs_data.json')
  jobsCache = jobsData as Job[]
  return jobsCache
}

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
  const [parsedGoal, resolvedUsers, jobs] = await Promise.all([
    parseGoal(goal),
    Promise.all(userIds.map((id) => resolveUserWithJobs(id))),
    getJobs(),
  ])
  const webUsers: UserWithJobs[] = resolvedUsers.filter(
    (u): u is UserWithJobs => u !== null,
  )
  const matches: JobMatch[] = buildJobMatches(jobs, webUsers, parsedGoal)

  return NextResponse.json({ matches })
}
