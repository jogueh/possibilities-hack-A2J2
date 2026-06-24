import type { SharedContext } from '@/types/sharedContext'

// =============================================================================
// /api/node/talking-points request + response shapes
// =============================================================================
// Used by W3's sidebar AI tip callout. W3 builds the request from already-loaded
// data (viewer profile + clicked target + the goal) and renders the returned
// tip verbatim.
// =============================================================================

export interface TalkingPointsRequest {
  goalRaw: string
  /** Viewer's top skills + most recent role, summarised to one short string. */
  viewerSummary: string
  /** Target's relevant experience, summarised to one short string. */
  targetSummary: string
  sharedContext: SharedContext[]
}

export interface TalkingPointsResponse {
  tip: string
}
