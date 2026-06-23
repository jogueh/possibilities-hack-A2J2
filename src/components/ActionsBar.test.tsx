import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionsBar } from "@/components/ActionsBar";

describe("ActionsBar", () => {
  it("opens the connect confirmation modal on Connect click", () => {
    render(<ActionsBar targetName="Alice" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog", { name: "Connect" })).toBeInTheDocument();
    expect(screen.getByText("Send Alice a connection request?")).toBeInTheDocument();
  });

  it("shows a success toast after confirming a connection request", () => {
    render(<ActionsBar targetName="Alice" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("status")).toHaveTextContent("Connection request sent to Alice");
  });

  it("pre-fills the message subject from the AI talking point", () => {
    render(<ActionsBar targetName="Alice" tip="Ask about her time at Google" />);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("Ask about her time at Google");
  });

  it("falls back to a default subject when no tip is provided", () => {
    render(<ActionsBar targetName="Alice" tip={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("Connecting with you, Alice");
  });

  it("shows a success toast after sending a message", () => {
    render(<ActionsBar targetName="Alice" tip="hi" />);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("status")).toHaveTextContent("Message sent to Alice");
  });

  it("closes a modal when Escape is pressed", () => {
    render(<ActionsBar targetName="Alice" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog", { name: "Connect" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("clears a previously typed message body when the composer is reopened", () => {
    render(<ActionsBar targetName="Alice" tip="hi" />);
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    fireEvent.change(screen.getByLabelText("Message body"), { target: { value: "draft text" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Message" }));
    expect(screen.getByLabelText("Message body")).toHaveValue("");
  });

  it("renders action buttons with explicit type=button", () => {
    render(<ActionsBar targetName="Alice" />);
    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Message" })).toHaveAttribute("type", "button");
  });
});
