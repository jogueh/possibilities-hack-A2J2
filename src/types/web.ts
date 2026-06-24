// Shared contract for the Graph Canvas (Workflow 1) and its sibling workflows
// (goal capture, scoring, AI intro drafting). Treat these types as a frozen
// cross-workflow interface: change with care.

export type AlignmentTier = 'strong' | 'moderate' | 'weak'
export type WebState = 'empty' | 'seeded' | 'expanded'
export type DegreeLevel = 1 | 2

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
