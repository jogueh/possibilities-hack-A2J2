import { describe, it, expect, vi } from "vitest";
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

  it("prompts an upgrade when the premium InMail button is clicked", () => {
    const onUpgrade = vi.fn();
    render(<ActionsBar targetName="Alice" onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByRole("button", { name: /InMail/ }));
    expect(onUpgrade).toHaveBeenCalledWith("inmail");
  });

  it("prompts an upgrade (and skips the connect dialog) when at the connection limit", () => {
    const onUpgrade = vi.fn();
    render(<ActionsBar targetName="Alice" degree={2} atConnectionLimit onUpgrade={onUpgrade} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onUpgrade).toHaveBeenCalledWith("connection");
    expect(screen.queryByRole("dialog", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("closes a modal when Escape is pressed", () => {
    render(<ActionsBar targetName="Alice" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("dialog", { name: "Connect" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Connect" })).not.toBeInTheDocument();
  });

  it("renders action buttons with explicit type=button", () => {
    render(<ActionsBar targetName="Alice" />);
    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: /InMail/ })).toHaveAttribute("type", "button");
  });

  it("hides the Connect button for 1st-degree connections", () => {
    render(<ActionsBar targetName="Alice" degree={1} />);
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    // InMail stays available for everyone.
    expect(screen.getByRole("button", { name: /InMail/ })).toBeInTheDocument();
  });

  it("shows the Connect button for 2nd-degree connections", () => {
    render(<ActionsBar targetName="Alice" degree={2} />);
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
  });

  it("invokes onConnect when a connection request is confirmed", () => {
    const onConnect = vi.fn();
    render(<ActionsBar targetName="Alice" degree={2} onConnect={onConnect} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled Connected state once connected", () => {
    render(<ActionsBar targetName="Alice" degree={2} connected />);
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    const connected = screen.getByRole("button", { name: "Connected ✓" });
    expect(connected).toBeDisabled();
  });
});
