import { describe, it, expectTypeOf } from 'vitest'
import type {
  AlignmentTier,
  ActivityStatus,
  WebState,
  DegreeLevel,
  WebNode,
  WebEdge,
  GoalQuery,
  WebSnapshot,
} from '@/types/web'

// These are compile-time/type-level assertions that lock the cross-workflow
// contract in place. They fail the build if the shape of web.ts drifts.
describe('web types contract', () => {
  it('exposes the expected literal unions', () => {
    expectTypeOf<AlignmentTier>().toEqualTypeOf<'strong' | 'moderate' | 'weak'>()
    expectTypeOf<ActivityStatus>().toEqualTypeOf<'active' | 'moderate' | 'inactive'>()
    expectTypeOf<WebState>().toEqualTypeOf<'empty' | 'seeded' | 'expanded'>()
    expectTypeOf<DegreeLevel>().toEqualTypeOf<number>()
  })

  it('describes a WebNode', () => {
    expectTypeOf<WebNode>().toMatchObjectType<{
      id: string
      userId: string
      label: string
      degree: DegreeLevel
      avatarInitials: string
      alignmentTier: AlignmentTier
      interactionScore: number
      relevanceScore: number
      position: { x: number; y: number }
      headline?: string
      activityStatus?: ActivityStatus
      photo?: string
    }>()
  })

  it('describes a WebEdge', () => {
    expectTypeOf<WebEdge>().toMatchObjectType<{
      id: string
      source: string
      target: string
      strength: number
      isDotted: boolean
      isMetUp?: boolean
    }>()
  })

  it('describes a GoalQuery', () => {
    expectTypeOf<GoalQuery>().toMatchObjectType<{ raw: string; userId: string }>()
  })

  it('describes a WebSnapshot', () => {
    expectTypeOf<WebSnapshot>().toMatchObjectType<{
      state: WebState
      nodes: WebNode[]
      edges: WebEdge[]
      goal: GoalQuery | null
    }>()
  })
})
