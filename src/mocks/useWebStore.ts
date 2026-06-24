// ⚠️ W3 MOCK — replace with W1 real impl at `src/store/useWebStore.ts`. See plan.md
// Mirrors the zustand `useWebStore((s) => s.x)` selector API EXACTLY so swapping to the
// real W1 store is a pure import change. Only exposes the slice W3 reads/calls.
import { useSyncExternalStore } from "react";
import { useRef } from "react";
import type { GoalQuery, WebEdge, WebNode } from "@/mocks/web";
import type { UserWithJobs } from "@/mocks/data";
import type { ParsedGoal } from "@/types/goal";

export interface WebStoreState {
  goal: GoalQuery | null;
  parsedGoal: ParsedGoal | null;
  nodes: WebNode[];
  edges: WebEdge[];
  // Viewer's own resolved profile — W1 fetches once on app load and stores it; W3 reads it.
  viewerProfile: UserWithJobs | null;
  // W4-owned action (lives on W1 store). W3 only ever CALLS it. Appends `node` to `nodes`,
  // idempotent on duplicate id. (`parentNodeId` is accepted for signature parity but unused here.)
  addSecondDegreeNode: (node: WebNode, parentNodeId: string) => void;
}

let state: WebStoreState = {
  goal: null,
  parsedGoal: null,
  nodes: [],
  edges: [],
  viewerProfile: null,
  addSecondDegreeNode: () => {},
};

const listeners = new Set<() => void>();

function setState(partial: Partial<WebStoreState>) {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
}

const defaultAddSecondDegreeNode: WebStoreState["addSecondDegreeNode"] = (node, parentNodeId) => {
  const parentExists = state.nodes.some((n) => n.id === parentNodeId);

  const nextNodes = state.nodes.some((n) => n.id === node.id)
    ? state.nodes
    : [...state.nodes, node];

  const hasSolidEdge =
    !parentExists ||
    state.edges.some(
      (e) => e.source === parentNodeId && e.target === node.id && e.isDotted === false,
    );
  const nextEdges = hasSolidEdge
    ? state.edges
    : [
        ...state.edges,
        {
          id: `e_${parentNodeId}_${node.id}_solid`,
          source: parentNodeId,
          target: node.id,
          strength: 50,
          isDotted: false,
        },
      ];

  if (nextNodes === state.nodes && nextEdges === state.edges) return; // idempotent
  setState({ nodes: nextNodes, edges: nextEdges });
};
state.addSecondDegreeNode = defaultAddSecondDegreeNode;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWebStore<T>(selector: (s: WebStoreState) => T): T {
  // Cache the selected snapshot and only recompute when the store state ref changes,
  // so selectors returning new objects don't trigger an infinite render loop.
  const cache = useRef<{ state: WebStoreState; value: T } | null>(null);
  const getSnapshot = () => {
    if (!cache.current || cache.current.state !== state) {
      cache.current = { state, value: selector(state) };
    }
    return cache.current.value;
  };
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Test/dev helpers (NOT part of the real W1 store API) ──────────────────────
export function __setMockWebState(partial: Partial<WebStoreState>) {
  setState(partial);
}

export function __resetMockWebState() {
  state = {
    goal: null,
    parsedGoal: null,
    nodes: [],
    edges: [],
    viewerProfile: null,
    addSecondDegreeNode: defaultAddSecondDegreeNode,
  };
  listeners.forEach((l) => l());
}
