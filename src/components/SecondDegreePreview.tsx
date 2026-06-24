"use client";
// W3-OWNED. 2nd-degree preview inside the node sidebar. Lists pre-loaded 2nd-degree nodes
// connected to the open 1st-degree node and lets the viewer add them to the web. See plan.md
import { useState } from "react";
import type { WebNode } from "@/types/web";
import { useWebStore } from "@/store/useWebStore";
import { ALIGNMENT_LABELS, alignmentColor } from "@/lib/alignmentColors";
import { photoUrlForUser } from "@/lib/avatarPhoto";
import { LI } from "@/lib/linkedinTokens";

interface SecondDegreePreviewProps {
  parentNode: WebNode;
  parentName: string;
}

export function SecondDegreePreview({ parentNode, parentName }: SecondDegreePreviewProps) {
  const nodes = useWebStore((s) => s.nodes);
  const edges = useWebStore((s) => s.edges);
  const addSecondDegreeNode = useWebStore((s) => s.addSecondDegreeNode);
  const [added, setAdded] = useState<Set<string>>(new Set());

  // 2nd-degree nodes connected to this 1st-degree node (W2 enforces the ≥70 threshold).
  const childIds = new Set(
    edges.filter((e) => e.source === parentNode.id && e.isDotted).map((e) => e.target),
  );
  const children = nodes.filter((n) => n.degree === 2 && childIds.has(n.id)).slice(0, 3);

  // Omit the section entirely when there are no qualifying 2nd-degree nodes.
  if (children.length === 0) return null;

  const handleAdd = (child: WebNode) => {
    addSecondDegreeNode(child, parentNode.id);
    setAdded((prev) => new Set(prev).add(child.id));
  };

  return (
    <section data-testid="second-degree" style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
        People {parentName} can introduce you to
      </h3>
      {children.map((child) => {
        const isAdded = added.has(child.id);
        return (
          <div
            key={child.id}
            style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}
          >
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: LI.bg,
                border: `2px solid ${alignmentColor(child.alignmentTier)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {child.avatarInitials}
              {/* Photo overlays the initials; a failed load stays transparent so
                  the initials behind it remain visible as the fallback. */}
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${child.photo ?? photoUrlForUser(child.userId)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{child.label}</div>
              <div style={{ color: LI.textSecondary, fontSize: 12 }}>
                {ALIGNMENT_LABELS[child.alignmentTier]}
              </div>
            </div>
            <button
              onClick={() => handleAdd(child)}
              disabled={isAdded}
              aria-label={isAdded ? `${child.label} added` : `Add ${child.label} to web`}
              style={{
                border: `1px solid ${isAdded ? LI.green : LI.blue}`,
                color: isAdded ? LI.green : LI.blue,
                background: "transparent",
                borderRadius: 16,
                padding: "4px 12px",
                fontSize: 13,
                fontWeight: 600,
                cursor: isAdded ? "default" : "pointer",
              }}
            >
              {isAdded ? "Added ✓" : "Add to web"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
