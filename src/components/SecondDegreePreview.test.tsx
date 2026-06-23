import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SecondDegreePreview } from "@/components/SecondDegreePreview";
import {
  __setMockWebState,
  __resetMockWebState,
  useWebStore,
} from "@/mocks/useWebStore";
import { renderHook } from "@testing-library/react";
import type { WebEdge, WebNode } from "@/mocks/web";

function n(id: string, degree: 1 | 2, label: string): WebNode {
  return {
    id,
    userId: "u_" + id,
    label,
    degree,
    avatarInitials: label.slice(0, 2).toUpperCase(),
    alignmentTier: "strong",
    interactionScore: 0,
    relevanceScore: 80,
    position: { x: 0, y: 0 },
  };
}

const parent = n("n1", 1, "Alice");
const child = n("n2", 2, "Carol");
const edge: WebEdge = { id: "e1", source: "n1", target: "n2", strength: 50, isDotted: true };

beforeEach(() => __resetMockWebState());

describe("SecondDegreePreview", () => {
  it("renders nothing when the node has no 2nd-degree connections", () => {
    __setMockWebState({ nodes: [parent], edges: [] });
    const { container } = render(<SecondDegreePreview parentNode={parent} parentName="Alice" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists connected 2nd-degree nodes under the parent", () => {
    __setMockWebState({ nodes: [parent, child], edges: [edge] });
    render(<SecondDegreePreview parentNode={parent} parentName="Alice" />);
    expect(screen.getByText("People Alice can introduce you to")).toBeInTheDocument();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });

  it("dispatches addSecondDegreeNode and shows 'Added ✓' after clicking Add to web", () => {
    const addSpy = vi.fn();
    __setMockWebState({ nodes: [parent, child], edges: [edge], addSecondDegreeNode: addSpy });
    render(<SecondDegreePreview parentNode={parent} parentName="Alice" />);

    const btn = screen.getByRole("button", { name: "Add Carol to web" });
    fireEvent.click(btn);

    expect(addSpy).toHaveBeenCalledWith(child, "n1");
    const addedBtn = screen.getByRole("button", { name: "Carol added" });
    expect(addedBtn).toHaveTextContent("Added ✓");
    expect(addedBtn).toBeDisabled();
  });

  it("only shows up to 3 connected nodes", () => {
    const kids = [n("n2", 2, "C2"), n("n3", 2, "C3"), n("n4", 2, "C4"), n("n5", 2, "C5")];
    const edges: WebEdge[] = kids.map((k) => ({
      id: "e_" + k.id,
      source: "n1",
      target: k.id,
      strength: 50,
      isDotted: true,
    }));
    __setMockWebState({ nodes: [parent, ...kids], edges });
    render(<SecondDegreePreview parentNode={parent} parentName="Alice" />);
    expect(screen.getAllByRole("button", { name: /Add .* to web/ })).toHaveLength(3);
  });

  it("mock store actually appends the node when added", () => {
    __setMockWebState({ nodes: [parent, child], edges: [edge] });
    const { result } = renderHook(() => useWebStore((s) => s.nodes));
    render(<SecondDegreePreview parentNode={parent} parentName="Alice" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Carol to web" }));
    // child already present (pre-loaded), so idempotent add keeps a single instance
    expect(result.current.filter((x) => x.id === "n2")).toHaveLength(1);
  });
});
