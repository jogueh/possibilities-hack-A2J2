"use client";
// =============================================================================
// useJobOverlapDecorations — Workflow 4, Step 6 (canvas overlap highlight).
// =============================================================================
// Produces the `nodeDecorations` map the canvas consumes so connections who work
// at a company with a relevant open role get the pulsing "job overlap" ring.
//
// Reads `goal` + `nodes` from the W1 web store, fetches the goal's job matches
// (each already carries its `webConnections`), and maps the overlapping members
// back to their `WebNode.id`. All decision logic lives in the pure, unit-tested
// `overlappingNodeIds` helper (@/lib/webOverlap); this hook is just the glue.
//
// DATA SOURCE: the W4 jobs-match library at `@/lib/jobMatchesClient` (a
// client-side wrapper around `buildJobMatches` that resolves users via the
// real members dataset). A server `/api/jobs/matches` route is tracked as a
// follow-up; swapping to it would only touch this hook's single import.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import type { JobMatch } from "@/types/job";
import type { NodeDecoration } from "@/components/web/WebCanvas";
import { useWebStore } from "@/store/useWebStore";
import { parseGoalFallback } from "@/lib/goalParser";
import { fetchJobMatches } from "@/lib/jobMatchesClient";
import { overlappingNodeIds } from "@/lib/webOverlap";

/**
 * Returns a `{ [nodeId]: { hasJobOverlap: true } }` map for the current web,
 * ready to pass straight to `<WebCanvas nodeDecorations={...} />`. Returns an
 * empty map while there is no goal or no matches have loaded yet.
 */
export function useJobOverlapDecorations(): Record<string, NodeDecoration> {
  const goal = useWebStore((s) => s.goal);
  const nodes = useWebStore((s) => s.nodes);

  const webUserIds = nodes.map((n) => n.userId);
  // Stable key so we only refetch when the goal or the web's membership changes.
  const requestKey = goal
    ? `${goal.raw}::${[...webUserIds].sort().join(",")}`
    : null;

  // React 19: never call setState synchronously in an effect — only from the
  // async callback. The key guards against stale responses overwriting newer
  // ones (and against rendering a result for a different goal/web).
  const [result, setResult] = useState<{
    key: string;
    matches: JobMatch[];
  } | null>(null);

  useEffect(() => {
    if (!goal || !requestKey) return;
    let cancelled = false;
    fetchJobMatches(parseGoalFallback(goal.raw), webUserIds)
      .then((matches) => {
        if (!cancelled) setResult({ key: requestKey, matches });
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, matches: [] });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return useMemo(() => {
    const matches = result?.key === requestKey ? result.matches : [];
    const ids = overlappingNodeIds(matches, nodes);
    const decorations: Record<string, NodeDecoration> = {};
    for (const id of ids) decorations[id] = { hasJobOverlap: true };
    return decorations;
  }, [requestKey, result, nodes]);
}
