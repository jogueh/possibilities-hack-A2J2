import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAllUsers, resolveJobs } from '@/lib/data'
import { parseGoal } from '@/lib/goalParser'
import { buildWeb } from '@/lib/webBuilder'
import type { UserWithJobs } from '@/types/data'

// POST /api/web/generate
// Request:  { goal: string, userId?: string }
// Response: { nodes: WebNode[], edges: WebEdge[] }
// Consumed by Workflow 1 to seed the canvas.

const DEFAULT_VIEWER_ID = 'user_4579'

const requestSchema = z.object({
  goal: z.string().min(1, 'goal is required'),
  userId: z.string().min(1).optional(),
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
  const { goal, userId = DEFAULT_VIEWER_ID } = parsed.data

  const [users, parsedGoal] = await Promise.all([getAllUsers(), parseGoal(goal)])

  // Resolve every user's job_history once. Jobs are also memoized in
  // `src/lib/data.ts`, so this is cheap after the first request.
  const candidates: UserWithJobs[] = await Promise.all(
    users.map(async (u) => {
      const jobs = await resolveJobs(u.job_history)
      return {
        id: u.id,
        name: u.name,
        school_history: u.school_history,
        current_location: u.current_location,
        posts_activity: u.posts_activity,
        skills: u.skills,
        courses: u.courses,
        connections: u.connections,
        job_history: jobs,
      }
    }),
  )

  const { nodes, edges } = buildWeb({
    viewerUserId: userId,
    parsedGoal,
    candidates,
  })

  return NextResponse.json({ nodes, edges })
}
