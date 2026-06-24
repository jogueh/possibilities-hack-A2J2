import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionsBar } from "@/components/ActionsBar";
import { __resetMetUpLog } from "@/components/MetUpButton";

beforeEach(() => __resetMetUpLog());

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
    fireEvent.click(screen.getByRole("button", { name: "InMail" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("Ask about her time at Google");
  });

  it("falls back to a default subject when no tip is provided", () => {
    render(<ActionsBar targetName="Alice" tip={null} />);
    fireEvent.click(screen.getByRole("button", { name: "InMail" }));
    expect(screen.getByLabelText("Subject")).toHaveValue("Connecting with you, Alice");
  });

  it("shows a success toast after sending a message", () => {
    render(<ActionsBar targetName="Alice" tip="hi" />);
    fireEvent.click(screen.getByRole("button", { name: "InMail" }));
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
    fireEvent.click(screen.getByRole("button", { name: "InMail" }));
    fireEvent.change(screen.getByLabelText("Message body"), { target: { value: "draft text" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "InMail" }));
    expect(screen.getByLabelText("Message body")).toHaveValue("");
  });

  it("renders action buttons with explicit type=button", () => {
    render(<ActionsBar targetName="Alice" />);
    expect(screen.getByRole("button", { name: "Connect" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "InMail" })).toHaveAttribute("type", "button");
  });

  it("hides the Connect button for 1st-degree connections", () => {
    render(<ActionsBar targetName="Alice" degree={1} />);
    expect(screen.queryByRole("button", { name: "Connect" })).not.toBeInTheDocument();
    // Message stays available for everyone.
    expect(screen.getByRole("button", { name: "InMail" })).toBeInTheDocument();
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

  it("renders an Add-to-web button for 2nd+-degree people", () => {
    render(<ActionsBar targetName="Alice" degree={2} />);
    expect(screen.getByRole("button", { name: "Add to web" })).toBeInTheDocument();
  });

  it("hides the Add-to-web button for 1st-degree people (already on the canvas)", () => {
    render(<ActionsBar targetName="Alice" degree={1} />);
    expect(screen.queryByRole("button", { name: "Add to web" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pinned to web" })).not.toBeInTheDocument();
  });

  it("invokes onPin and shows a confirmation toast when Add-to-web is clicked", () => {
    const onPin = vi.fn();
    render(<ActionsBar targetName="Alice" degree={2} onPin={onPin} />);
    fireEvent.click(screen.getByRole("button", { name: "Add to web" }));
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Alice added to your web");
  });

  it("shows a disabled Added state once pinned", () => {
    render(<ActionsBar targetName="Alice" degree={2} pinned />);
    expect(screen.queryByRole("button", { name: "Add to web" })).not.toBeInTheDocument();
    const pinned = screen.getByRole("button", { name: "Pinned to web" });
    expect(pinned).toBeDisabled();
    expect(pinned).toHaveTextContent("Added to web ✓");
  });

  it("offers the 'I met up' button for 1st-degree people and logs the meetup", () => {
    const onLogMeetup = vi.fn();
    render(
      <ActionsBar targetName="Alice" degree={1} nodeId="a" onLogMeetup={onLogMeetup} />,
    );
    const metUp = screen.getByRole("button", { name: /I met up with this person/ });
    fireEvent.click(metUp);
    expect(onLogMeetup).toHaveBeenCalledTimes(1);
    // Disables itself once logged.
    expect(screen.getByRole("button", { name: /Met up logged/ })).toBeDisabled();
  });

  it("uses board-controlled logged state for the meetup button", () => {
    const first = render(
      <ActionsBar targetName="Alice" degree={1} nodeId="a" onLogMeetup={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /I met up with this person/ }));
    first.unmount();

    const onLogMeetup = vi.fn();
    const { rerender } = render(
      <ActionsBar targetName="Alice" degree={1} nodeId="a" metUpLogged={false} onLogMeetup={onLogMeetup} />,
    );
    const enabled = screen.getByRole("button", { name: /I met up with this person/ });
    expect(enabled).toBeEnabled();
    fireEvent.click(enabled);
    expect(onLogMeetup).toHaveBeenCalledTimes(1);

    rerender(
      <ActionsBar targetName="Alice" degree={1} nodeId="a" metUpLogged onLogMeetup={onLogMeetup} />,
    );
    expect(screen.getByRole("button", { name: /Met up logged/ })).toBeDisabled();
  });

  it("does not offer the 'I met up' button for 2nd-degree people", () => {
    render(
      <ActionsBar targetName="Alice" degree={2} nodeId="c" onLogMeetup={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: /I met up with this person/ }),
    ).not.toBeInTheDocument();
  });
});
