"use client";
// ⚠️ W3 MANUAL-TESTING HARNESS — remove at integration (W1 provides the real canvas).
// Seeds the mock web store and renders clickable nodes so the NodeSidebar can be exercised
// end-to-end via `npm run dev` → http://localhost:3000/w3-demo. See docs/workflow-3.
import { useEffect, useState } from "react";
import { NodeSidebar } from "@/components/NodeSidebar";
import { __setMockWebState } from "@/mocks/useWebStore";
import { MOCK_USERS } from "@/mocks/userApi";
import type { WebNode, WebEdge } from "@/mocks/web";

const aliceNode: WebNode = {
  id: "n_alice",
  userId: "user_1001",
  label: "Alice Nguyen",
  degree: 1,
  avatarInitials: "AN",
  alignmentTier: "strong",
  interactionScore: 0,
  relevanceScore: 88,
  position: { x: 0, y: 0 },
};

const bobNode: WebNode = {
  id: "n_bob",
  userId: "user_4579",
  label: "Bob Smith",
  degree: 1,
  avatarInitials: "BS",
  alignmentTier: "moderate",
  interactionScore: 0,
  relevanceScore: 55,
  position: { x: 0, y: 0 },
};

const secondDegree: WebNode = {
  id: "n_2nd",
  userId: "user_1001",
  label: "Carol Lee",
  degree: 2,
  avatarInitials: "CL",
  alignmentTier: "strong",
  interactionScore: 0,
  relevanceScore: 76,
  position: { x: 0, y: 0 },
};

const edges: WebEdge[] = [
  { id: "e1", source: "n_alice", target: "n_2nd", strength: 50, isDotted: true },
];

export default function W3DemoPage() {
  const [selected, setSelected] = useState<WebNode | null>(null);

  useEffect(() => {
    __setMockWebState({
      goal: { raw: "Break into software engineering", userId: "user_4579" },
      parsedGoal: {
        intent: "Break into software engineering",
        targetRole: "Software Engineer",
      },
      viewerProfile: MOCK_USERS.user_4579,
      nodes: [aliceNode, bobNode, secondDegree],
      edges,
    });
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>W3 Node Sidebar — manual test harness</h1>
      <p>Click a node to open its profile sidebar.</p>
      <div style={{ display: "flex", gap: 12 }}>
        {[aliceNode, bobNode].map((node) => (
          <button
            key={node.id}
            onClick={() => setSelected(node)}
            style={{ padding: "12px 18px", borderRadius: 8, cursor: "pointer" }}
          >
            {node.label} ({node.alignmentTier})
          </button>
        ))}
        <button
          onClick={() => setSelected({ ...aliceNode, userId: "missing_user" })}
          style={{ padding: "12px 18px", borderRadius: 8, cursor: "pointer" }}
        >
          Trigger error state
        </button>
      </div>

      <NodeSidebar node={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
