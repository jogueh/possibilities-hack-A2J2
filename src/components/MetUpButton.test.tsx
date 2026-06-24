import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetUpButton, __resetMetUpLog } from "@/components/MetUpButton";

describe("MetUpButton", () => {
  beforeEach(() => {
    __resetMetUpLog();
  });

  it("renders an enabled prompt before any meetup is logged", () => {
    render(<MetUpButton edgeId="e1" onLog={() => {}} />);
    const btn = screen.getByRole("button", { name: /linked up with this person/i });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onLog once and shows the confirmation toast on click", () => {
    const onLog = vi.fn();
    render(<MetUpButton edgeId="e1" onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: /linked up with this person/i }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("🔗 Linked up!");
  });

  it("disables itself for the session after logging", () => {
    render(<MetUpButton edgeId="e1" onLog={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /linked up with this person/i }));
    const btn = screen.getByRole("button", { name: /✓ Linked up/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("does not call onLog again once already logged", () => {
    const onLog = vi.fn();
    render(<MetUpButton edgeId="e1" onLog={onLog} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it("stays disabled after an unmount/remount for the same edge", () => {
    const onLog = vi.fn();
    const first = render(<MetUpButton edgeId="e1" onLog={onLog} />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();

    render(<MetUpButton edgeId="e1" onLog={onLog} />);
    const btn = screen.getByRole("button", { name: /✓ Linked up/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(1); // not logged a second time
  });

  it("tracks the logged flag per edge", () => {
    const onLog = vi.fn();
    const { rerender } = render(<MetUpButton edgeId="e1" onLog={onLog} />);
    fireEvent.click(screen.getByRole("button"));

    // A different edge starts enabled.
    rerender(<MetUpButton edgeId="e2" onLog={onLog} />);
    const btn = screen.getByRole("button", { name: /linked up with this person/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(2);
  });

  it("uses controlled logged state when provided", () => {
    const onLog = vi.fn();
    const first = render(<MetUpButton edgeId="e1" onLog={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();

    const { rerender } = render(<MetUpButton edgeId="e1" logged={false} onLog={onLog} />);
    const btn = screen.getByRole("button", { name: /linked up with this person/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(1);

    rerender(<MetUpButton edgeId="e1" logged onLog={onLog} />);
    expect(screen.getByRole("button", { name: /✓ Linked up/i })).toBeDisabled();
  });

  it("__resetMetUpLog clears the session log", () => {
    const first = render(<MetUpButton edgeId="e1" onLog={() => {}} />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    __resetMetUpLog();

    render(<MetUpButton edgeId="e1" onLog={() => {}} />);
    expect(
      screen.getByRole("button", { name: /linked up with this person/i }),
    ).toBeEnabled();
  });
});
