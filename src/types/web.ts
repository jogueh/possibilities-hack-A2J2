// Shared contract for the Graph Canvas (Workflow 1) and its sibling workflows
// (goal capture, scoring, AI intro drafting). Treat these types as a frozen
// cross-workflow interface: change with care.

export type AlignmentTier = 'strong' | 'moderate' | 'weak'
export type WebState = 'empty' | 'seeded' | 'expanded'
export type DegreeLevel = 1 | 2

/**
 * Outreach-activity status, used to colour a node's "activity ring":
 * active = blue, moderate = amber, inactive = red. Mirrors the values of
 * scoring.ts `ActivityStatus` (kept inline here to keep this cross-workflow
 * type contract free of runtime imports).
 */
export type ActivityStatus = 'active' | 'moderate' | 'inactive'

export interface WebNode {
  id: string
  userId: string
  label: string
  degree: DegreeLevel
  avatarInitials: string
  alignmentTier: AlignmentTier
  interactionScore: number
  relevanceScore: number
  position: { x: number; y: number }
  /**
   * Optional headline shown under the node name (e.g. "Software Engineer at
   * Innovatech"). Additive/optional so sibling workflows that don't supply it
   * remain compatible; Workflow 2 can populate it from resolved job data.
   */
  headline?: string
  /**
   * Optional outreach-activity status driving the node's activity-ring colour
   * (blue/amber/red). Additive/optional so workflows that don't supply it stay
   * compatible; derived from a member's recent activity (see deriveActivityStatus).
   */
  activityStatus?: ActivityStatus
}

export interface WebEdge {
  id: string
  source: string
  target: string
  strength: number
  isDotted: boolean
}

export interface GoalQuery {
  raw: string
  userId: string
}

export interface WebSnapshot {
  state: WebState
  nodes: WebNode[]
  edges: WebEdge[]
  goal: GoalQuery | null
}
