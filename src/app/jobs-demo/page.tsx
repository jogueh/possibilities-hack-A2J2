"use client";
// ⚠️ W4 MANUAL-TESTING HARNESS — remove at integration (W1 provides the real canvas
// + top nav). Seeds the real W1 web store and renders the JobsPanel + toggle so the
// jobs-discovery flow can be exercised end-to-end via `npm run dev` →
// http://localhost:3000/jobs-demo. See plan.md
import { useEffect, useState } from "react";
import { JobsPanel, JOBS_PANEL_WIDTH } from "@/components/JobsPanel";
import { JobsPanelToggle } from "@/components/JobsPanelToggle";
import { __setMockWebState } from "@/store/useWebStore";
import type { WebNode } from "@/types/web";
import type { UserWithJobs } from "@/types/data";

// Bob (user_4579) worked at Google + Innovatech; Alice (user_1001) worked at Google.
// A software-engineering goal surfaces Google SWE roles → web overlap on both.
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

export default function JobsDemoPage() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    __setMockWebState({
      goal: { raw: "Break into software engineering in technology", userId: "user_4579" },
      viewerProfile: null,
      nodes: [bobNode, aliceNode],
      edges: [],
    });
    fetch("/api/user/user_4579")
      .then((r) => (r.ok ? (r.json() as Promise<UserWithJobs>) : null))
      .then((viewer) => {
        if (viewer) __setMockWebState({ viewerProfile: viewer });
      })
      .catch(() => {
        /* dev-only harness; surface no UI error */
      });
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "sans-serif", marginLeft: open ? JOBS_PANEL_WIDTH : 0 }}>
      <h1>W4 Jobs Panel — manual test harness</h1>
      <p>Toggle the panel to see goal-matched jobs cross-referenced against the web.</p>
      <JobsPanelToggle open={open} onClick={() => setOpen((o) => !o)} />

      <JobsPanel
        open={open}
        onClose={() => setOpen(false)}
        onOpenConnection={(userId) => alert(`Would open W3 sidebar for ${userId}`)}
      />
    </main>
  );
}
