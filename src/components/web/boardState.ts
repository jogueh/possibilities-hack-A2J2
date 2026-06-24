import type { GoalQuery, WebSnapshot, ConnectionStage, HelpfulnessTag } from '@/types/web'
import type { LayoutOptions } from '@/lib/web/layout'
import {
  buildSnapshot,
  expandNode,
  revealPerson,
  type PersonInput,
} from '@/lib/web/snapshot'

// Pure state machine backing the WebBoard. Kept framework-free so the
// empty -> seeded -> expanded transitions and selection are unit-testable.

// Tie strength applied to a bridge edge once the viewer connects with the
// 2nd-degree person it reaches, so the (now solid) line reads as a strong link.
const CONNECTED_STRENGTH = 0.9

// Tie strength applied to a node's solid edge for each relationship-depth stage
// ("Connection Depth"). The values are chosen to land each stage in a distinct
// edge-strength visual tier (see src/lib/edgeStrength.ts): met → steady (blue),
// collaborated → strong (indigo + pulse), advocate → vibrant (purple gradient + pulse).
// Advancing a connection therefore visibly strengthens its edge. `met` subsumes
// the old "I met up with this person" action (the first rung of the ladder).
export const STAGE_STRENGTH: Record<ConnectionStage, number> = {
  met: 0.4,
  collaborated: 0.65,
  advocate: 0.9,
}

// Forward-only order of the depth ladder, used to validate/compare advances.
export const STAGE_ORDER: ConnectionStage[] = ['met', 'collaborated', 'advocate']

// Free-tier cap on how many people the viewer can connect with before the
// "Upgrade to Premium" prompt appears. Premium is intentionally always off in
// the demo, so reaching the cap surfaces the upgrade modal rather than
// unlocking more connections.
export const CONNECTION_LIMIT = 3

// Which free-tier gate triggered the upgrade prompt. Only the connection cap is
// gated in this build (expansion depth and InMail are unrestricted).
export type UpgradeReason = 'connection'

export type BoardStatus = 'idle' | 'loading' | 'error'

export interface BoardState {
  snapshot: WebSnapshot
  selectedId: string | null
  goalText: string
  /** Ids of people the viewer has connected with (dotted bridge -> solid link). */
  connectedIds: string[]
  /**
   * Relationship-depth stage per person ("Connection Depth"). Absent key = no
   * stage yet. The viewer self-advances connections up the ladder; `applyStages`
   * strengthens each staged person's solid edge to `STAGE_STRENGTH[stage]`.
   * `met` subsumes the old "I met up" action. Resets on a new goal.
   */
  stages: Record<string, ConnectionStage>
  /**
   * Optional helpfulness tags per person, attached when advancing a stage
   * (skippable). Session-only, resets on a new goal.
   */
  helpfulness: Record<string, HelpfulnessTag[]>
  /**
   * Ids of people the viewer has explicitly pinned to the canvas via
   * "Add to web". Their warm-path chain back to the viewer is re-applied
   * after every snapshot rebuild, so pinning preserves a 2nd-degree (or
   * deeper) node even when the viewer clicks a different 1st-degree
   * connector that would otherwise collapse this branch. Pinning is
   * orthogonal to connecting — you can pin a suggestion without committing
   * to connect with them.
   */
  pinnedIds: string[]
  /**
   * Resolved people for the current goal — populated from `/api/web/generate`
   * by the WebBoard. Empty until a goal is mapped. `selectNode` reads from
   * here so 2nd-degree expansion matches the goal-driven web rather than the
   * `config.people` fallback.
   */
  people: PersonInput[]
  status: BoardStatus
  error: string | null
  /**
   * Which free-tier gate (if any) is currently prompting an upgrade. `null`
   * when no prompt is open. Drives the "Upgrade to Premium" modal in WebBoard.
   */
  upgradePrompt: UpgradeReason | null
}

export type BoardAction =
  | { type: 'setGoalText'; value: string }
  | { type: 'submitGoal' }
  | { type: 'mapStart' }
  | { type: 'submitGoalWithPeople'; people: PersonInput[] }
  | { type: 'mapError'; error: string }
  | { type: 'selectNode'; id: string }
  | { type: 'connectNode'; id: string }
  | { type: 'pinNode'; id: string }
  | { type: 'setStage'; id: string; stage: ConnectionStage; tags?: HelpfulnessTag[] }
  | { type: 'showUpgrade'; reason: UpgradeReason }
  | { type: 'dismissUpgrade' }
  | { type: 'clearSelection' }
  | { type: 'reset' }

export interface BoardConfig {
  userId: string
  people: PersonInput[]
  options: LayoutOptions
}

export function createInitialBoardState(): BoardState {
  return {
    snapshot: { state: 'empty', nodes: [], edges: [], goal: null },
    selectedId: null,
    goalText: '',
    connectedIds: [],
    pinnedIds: [],
    stages: {},
    helpfulness: {},
    people: [],
    status: 'idle',
    error: null,
    upgradePrompt: null,
  }
}

/**
/**
 * Solidifies every dotted bridge edge that leads INTO a connected person (the
 * connected id is the edge target): the line stops being dotted, turns into a
 * strong link and is strengthened. Re-applied after a snapshot rebuild so a
 * connection survives re-expanding its connector. Outgoing bridges FROM a
 * connected node (to its not-yet-connected warm-path suggestions) intentionally
 * stay dotted — they only solidify once that further person is connected too.
 */
function applyConnections(
  snapshot: WebSnapshot,
  connectedIds: string[],
): WebSnapshot {
  if (connectedIds.length === 0) return snapshot
  const connected = new Set(connectedIds)
  const edges = snapshot.edges.map((e) =>
    e.isDotted && connected.has(e.target)
      ? { ...e, isDotted: false, strength: Math.max(e.strength, CONNECTED_STRENGTH) }
      : e,
  )
  return { ...snapshot, edges }
}

/**
 * Re-applies the warm-path expansion needed to keep every pinned person on
 * the canvas after a snapshot rebuild. Pinning a depth-N node implicitly
 * pins their entire warm-path chain back to the viewer (you can't show a
 * 3rd-degree node without rendering the 2nd-degree connector that introduces
 * them) — `walkViaChain` produces that chain by following `via` references
 * up to the 1st-degree root, and the loop reveals each link pairwise with
 * `revealPerson` so only the specific pinned path appears (NOT the sibling
 * suggestions that share the same parent).
 *
 * Idempotent and safe to call with an empty `pinnedIds` (no-op).
 */
function applyPins(
  snapshot: WebSnapshot,
  pinnedIds: string[],
  people: PersonInput[],
  options: LayoutOptions,
): WebSnapshot {
  if (pinnedIds.length === 0) return snapshot
  const byId = new Map(people.map((p) => [p.id, p]))
  let out = snapshot
  for (const pinnedId of pinnedIds) {
    const chain = walkViaChain(pinnedId, byId)
    // The depth-1 root is already in the snapshot; walk the rest of the
    // chain (depth 2 -> pinned) and add each person individually.
    // `revealPerson` is a no-op if the person is already present, so chains
    // that share a prefix don't duplicate work.
    for (let i = 1; i < chain.length; i++) {
      const person = byId.get(chain[i])
      if (!person) continue
      out = revealPerson(out, person, options)
    }
  }
  return out
}

/**
 * Walks a person's `via` chain from a 1st-degree root down to `id`. Returns
 * `[root, ..., id]` (length === person's degree). Returns `[id]` if the id
 * is itself a 1st-degree or unknown — in both cases there is nothing further
 * to expand to surface it on the canvas.
 */
function walkViaChain(
  id: string,
  byId: Map<string, PersonInput>,
): string[] {
  const chain: string[] = []
  let cursor: string | undefined = id
  // Cap iterations defensively in case of a circular via reference (data bug,
  // not user error). The realistic chain is bounded by MAX_DEGREE.
  for (let i = 0; cursor && i < 32; i++) {
    chain.unshift(cursor)
    const p = byId.get(cursor)
    if (!p || p.degree === 1 || !p.via) break
    cursor = p.via
  }
  return chain
}

/**
 * Strengthens each staged person's direct self-edge. Warm-path bridges for
 * deeper people are intentionally left untouched; stage state can be recorded
 * for them, but only self↔person edges get the visual tier treatment. The line
 * is solidified, its strength set to `STAGE_STRENGTH[stage]` (so it renders in a
 * distinct tier per stage — blue/indigo/purple), and it is flagged
 * `stage`/`isMetUp` so the canvas colours it by tier rather than as a normal
 * blue link. Idempotent and safe to re-apply after a rebuild.
 *
 * Strength is set directly (not `Math.max`) so advancing is authoritative — the
 * stage is the source of truth for a staged edge's strength, including after the
 * baseline is compressed in `snapshot.ts`.
 */
function applyStages(
  snapshot: WebSnapshot,
  stages: Record<string, ConnectionStage>,
): WebSnapshot {
  const ids = Object.keys(stages)
  if (ids.length === 0) return snapshot
  const staged = new Set(ids)
  const selfId = snapshot.goal?.userId
  const edges = snapshot.edges.map((e) =>
    selfId && e.source === selfId && staged.has(e.target)
      ? {
          ...e,
          isDotted: false,
          isMetUp: true,
          stage: stages[e.target],
          strength: STAGE_STRENGTH[stages[e.target]],
        }
      : e,
  )
  return { ...snapshot, edges }
}

// Picks the people list to feed the layout: real API-resolved people if the
// board has them (`submitGoalWithPeople` ran), otherwise the static fallback
// from config. This preserves existing test/demo behavior for callers that
// dispatch `submitGoal` directly without going through the API path.
function effectivePeople(state: BoardState, config: BoardConfig): PersonInput[] {
  return state.people.length > 0 ? state.people : config.people
}

export function boardReducer(
  state: BoardState,
  action: BoardAction,
  config: BoardConfig,
): BoardState {
  switch (action.type) {
    case 'setGoalText':
      return { ...state, goalText: action.value }

    case 'submitGoal': {
      const raw = state.goalText.trim()
      if (!raw) return state
      const goal: GoalQuery = { raw, userId: config.userId }
      const people = effectivePeople(state, config)
      return {
        ...state,
        snapshot: buildSnapshot(goal, people, config.options),
        selectedId: null,
        connectedIds: [],
        pinnedIds: [],
        stages: {},
        helpfulness: {},
        status: 'idle',
        error: null,
        upgradePrompt: null,
      }
    }

    case 'mapStart':
      return { ...state, status: 'loading', error: null }

    case 'submitGoalWithPeople': {
      const raw = state.goalText.trim()
      if (!raw) return { ...state, status: 'idle' }
      const goal: GoalQuery = { raw, userId: config.userId }
      return {
        ...state,
        snapshot: buildSnapshot(goal, action.people, config.options),
        selectedId: null,
        connectedIds: [],
        pinnedIds: [],
        stages: {},
        helpfulness: {},
        people: action.people,
        status: 'idle',
        error: null,
        upgradePrompt: null,
      }
    }

    case 'mapError':
      return { ...state, status: 'error', error: action.error }

    case 'selectNode': {
      const clicked = state.snapshot.nodes.find((n) => n.id === action.id)
      if (!clicked || !state.snapshot.goal) {
        return { ...state, selectedId: action.id }
      }

      const people = effectivePeople(state, config)
      let snapshot = state.snapshot
      if (clicked.degree === 1) {
        // Selecting a 1st-degree node reveals ONLY that connector's
        // 2nd-degree people, clustered next to it. 1st-degree IS the set of
        // real connections the viewer is already part of, so revealing the
        // suggestions reachable through them is always allowed. Rebuilding
        // from the seeded snapshot first collapses any other connector that
        // was previously expanded — but pinned and connected warm paths are
        // then re-materialized so explicitly retained people survive the
        // rebuild.
        const seeded = buildSnapshot(
          state.snapshot.goal,
          people,
          config.options,
        )
        snapshot = expandNode(seeded, action.id, people, config.options)
      } else if (state.connectedIds.includes(clicked.id)) {
        // Selecting a deeper node (2nd+) reveals its next-ring children IN
        // PLACE — but ONLY if the viewer has explicitly "connected" with that
        // node. Each ring beyond 1st-degree is a suggestion until the viewer
        // accepts the warm-path intro: connecting unlocks the next layer
        // of suggestions reachable through that person, mirroring real-world
        // network growth (you can't navigate a 3rd-degree intro until your
        // 2nd-degree connection introduces you).
        snapshot = expandNode(state.snapshot, action.id, people, config.options)
      }
      // For unconnected 2nd+ nodes, fall through with `snapshot = state.snapshot`
      // — selection still updates so the sidebar opens with the "Connect" CTA,
      // but the canvas does not reveal further suggestions until they accept.
      const retainedIds = [...new Set([...state.pinnedIds, ...state.connectedIds])]
      snapshot = applyPins(
        snapshot,
        retainedIds,
        people,
        config.options,
      )
      return {
        ...state,
        snapshot: applyStages(
          applyConnections(snapshot, state.connectedIds),
          state.stages,
        ),
        selectedId: action.id,
      }
    }

    case 'connectNode': {
      // Connecting reaches a 2nd+-degree person through their warm-path bridge:
      // record the link, turn the dotted bridge into a solid strengthened (blue)
      // edge, and unlock the next layer of suggestions reachable through them.
      // The next-layer reveal happens lazily on the next `selectNode` click on
      // that node — we do not eagerly expand here, so connecting is a clean
      // commitment action that the viewer can take without rearranging the
      // canvas. Idempotent — connecting again is a no-op.
      if (state.connectedIds.includes(action.id)) return state
      // Free-tier connection cap: once the viewer has CONNECTION_LIMIT
      // connections, attempting another surfaces the upgrade prompt instead of
      // recording the connection (premium is always off in the demo).
      if (state.connectedIds.length >= CONNECTION_LIMIT) {
        return { ...state, upgradePrompt: 'connection' }
      }
      const connectedIds = [...state.connectedIds, action.id]
      return {
        ...state,
        connectedIds,
        snapshot: applyStages(
          applyConnections(state.snapshot, connectedIds),
          state.stages,
        ),
      }
    }

    case 'setStage': {
      // Advances a connection up the relationship-depth ladder ("Connection
      // Depth"). The stage authoritatively sets the strength of the solid edge
      // into this person (blue → indigo → purple by tier), so advancing visibly
      // strengthens the web. `met` subsumes the old "I met up" action. Forward-
      // only: a request that doesn't advance past the current stage is a no-op
      // (so re-clicking the current rung doesn't churn state). Optional
      // helpfulness `tags` are recorded (skippable) and merged, deduped.
      const current = state.stages[action.id]
      const advances =
        current === undefined ||
        STAGE_ORDER.indexOf(action.stage) > STAGE_ORDER.indexOf(current)
      const tags = action.tags ?? []
      const noTagChange =
        tags.length === 0 ||
        tags.every((t) => state.helpfulness[action.id]?.includes(t))
      if (!advances && noTagChange) return state
      const stages = advances
        ? { ...state.stages, [action.id]: action.stage }
        : state.stages
      const helpfulness =
        tags.length === 0
          ? state.helpfulness
          : {
              ...state.helpfulness,
              [action.id]: [
                ...new Set([...(state.helpfulness[action.id] ?? []), ...tags]),
              ],
            }
      return {
        ...state,
        stages,
        helpfulness,
        snapshot: applyStages(state.snapshot, stages),
      }
    }

    case 'pinNode': {
      // Pinning retains a person on the canvas across snapshot rebuilds. The
      // pinned node (and its warm-path chain back to the viewer) is
      // re-materialized after every selectNode rebuild via `applyPins`, so a
      // click on another 1st-degree connector no longer collapses this branch.
      // Orthogonal to `connectNode`: pinning is a display preference and
      // requires no commitment from the viewer. Idempotent.
      if (state.pinnedIds.includes(action.id)) return state
      // 1st-degree nodes are always on the canvas regardless, so a pin there
      // is recorded but materially a no-op. We still store it so the UI can
      // reflect the pinned state and the action is consistently idempotent.
      return { ...state, pinnedIds: [...state.pinnedIds, action.id] }
    }

    case 'clearSelection':
      return { ...state, selectedId: null }

    case 'showUpgrade':
      return { ...state, upgradePrompt: action.reason }

    case 'dismissUpgrade':
      return { ...state, upgradePrompt: null }

    case 'reset':
      return createInitialBoardState()

    default:
      return state
  }
}
