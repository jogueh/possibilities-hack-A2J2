import { create } from 'zustand'
import type {
  GoalQuery,
  WebEdge,
  WebNode,
  WebState,
} from '@/types/web'
import type { UserWithJobs } from '@/types/data'

// Global state for the connection web — the single source of truth other
// workflows read from and dispatch into. This module is the real W1 store that
// replaces the labelled mock at `src/mocks/useWebStore.ts`; it preserves that
// mock's selector API (`useWebStore((s) => s.x)`) and state fields verbatim so
// the integration swap is a one-line import change, and adds the full action
// set from the Workflow 1 scope.

// Cross-workflow scores travel on the 0–100 scale (see `src/types/web.ts`):
// node `interactionScore` and edge `strength`. Keep mutations inside that range.
const SCORE_MIN = 0
const SCORE_MAX = 100
const DEFAULT_EDGE_STRENGTH = 50

const clampScore = (n: number): number =>
  Math.min(SCORE_MAX, Math.max(SCORE_MIN, n))

export interface WebStoreState {
  // ── Snapshot slice (mirrors `WebSnapshot`; read by W3/W4) ──────────────────
  state: WebState
  goal: GoalQuery | null
  nodes: WebNode[]
  edges: WebEdge[]
  /** Viewer's own resolved profile — set once on app load, read by W3. */
  viewerProfile: UserWithJobs | null

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Stores the parsed goal (produced by Workflow 2). */
  setGoal: (goal: GoalQuery) => void
  /** Seeds the web with 1st-degree nodes/edges; moves to the `seeded` state. */
  seedWeb: (nodes: WebNode[], edges: WebEdge[]) => void
  /**
   * Appends a 2nd-degree `node` reached via `parentNodeId`, wiring a dotted
   * bridge edge, and moves to the `expanded` state. Idempotent on duplicate id.
   * (W4 owns the action semantically; it lives on the W1 store. `parentNodeId`
   * is used to draw the bridge edge.)
   */
  addSecondDegreeNode: (node: WebNode, parentNodeId: string) => void
  /**
   * Bumps both a node's `interactionScore` and an edge's `strength` by `delta`,
   * clamped to [0, 100]. Used by the "I met up" interaction (W4 stretch).
   */
  updateInteractionScore: (
    nodeId: string,
    edgeId: string,
    delta: number,
  ) => void
  /** Marks the web as `expanded` (e.g. to trigger a canvas re-layout). */
  expandWeb: () => void
  /** Clears the snapshot back to the empty state (new goal). Keeps the viewer. */
  resetWeb: () => void
  /** Stores the logged-in viewer's resolved profile. */
  setViewerProfile: (profile: UserWithJobs | null) => void
}

const emptySnapshot = () => ({
  state: 'empty' as WebState,
  goal: null,
  nodes: [] as WebNode[],
  edges: [] as WebEdge[],
})

export const useWebStore = create<WebStoreState>((set) => ({
  ...emptySnapshot(),
  viewerProfile: null,

  setGoal: (goal) => set({ goal }),

  seedWeb: (nodes, edges) => set({ nodes, edges, state: 'seeded' }),

  addSecondDegreeNode: (node, parentNodeId) =>
    set((s) => {
      const isDuplicate = s.nodes.some((n) => n.id === node.id)
      const nodes = isDuplicate ? s.nodes : [...s.nodes, node]

      // Edge ids follow the repo-wide `${source}__${target}` convention
      // (see src/lib/web/snapshot.ts and src/lib/webBuilder.ts) so bridge edges
      // stay consistent with edges produced elsewhere in the system.
      const edgeId = `${parentNodeId}__${node.id}`
      const parentInWeb = s.nodes.some((n) => n.id === parentNodeId)
      const edgeExists = s.edges.some((e) => e.id === edgeId)
      const edges =
        !parentInWeb || edgeExists
          ? s.edges
          : [
              ...s.edges,
              {
                id: edgeId,
                source: parentNodeId,
                target: node.id,
                strength: DEFAULT_EDGE_STRENGTH,
                isDotted: true,
              },
            ]

      // Nothing new revealed → idempotent no-op (preserve referential identity).
      if (nodes === s.nodes && edges === s.edges) return s
      return { nodes, edges, state: 'expanded' }
    }),

  updateInteractionScore: (nodeId, edgeId, delta) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, interactionScore: clampScore(n.interactionScore + delta) }
          : n,
      ),
      edges: s.edges.map((e) =>
        e.id === edgeId
          ? { ...e, strength: clampScore(e.strength + delta) }
          : e,
      ),
    })),

  expandWeb: () => set({ state: 'expanded' }),

  resetWeb: () => set({ ...emptySnapshot() }),

  setViewerProfile: (viewerProfile) => set({ viewerProfile }),
}))
