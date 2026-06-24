import type { SharedContext } from '@/types/sharedContext'

// =============================================================================
// /api/node/talking-points request + response shapes
// =============================================================================
// Used by W3's sidebar AI tip callout. W3 builds the request from already-loaded
// data (viewer profile + clicked target + the goal) and renders the returned
// tips verbatim. The richer optional fields (`targetName`, `targetLocation`,
// `targetPosts`) let the prompt anchor each variant on a different concrete
// detail; older callers can omit them and still get back a usable tip.
// =============================================================================

export interface TalkingPointsRequest {
  goalRaw: string
  /** Viewer's top skills + most recent role, summarised to one short string. */
  viewerSummary: string
  /** Target's relevant experience, summarised to one short string. */
  targetSummary: string
  sharedContext: SharedContext[]
  /** Target's display name. When supplied the LLM can address them directly. */
  targetName?: string
  /** Target's current city/region (e.g. "San Francisco, CA"). Helps surface
   *  location-anchored openers when the goal involves a place. */
  targetLocation?: string
  /** Most recent 1–3 strings from the target's posts_activity feed. Great as
   *  ice-breakers ("I saw you posted about…") when present. */
  targetPosts?: string[]
}

export interface TalkingPointsResponse {
  /** First (recommended) tip. Equivalent to `tips[0]`. Kept for back-compat. */
  tip: string
  /** Up to 3 distinct opener variants, each anchoring on a different angle
   *  (shared background, target's recent activity, advice-seeking on the
   *  viewer's goal). The first is always `tip`. */
  tips: string[]
}
