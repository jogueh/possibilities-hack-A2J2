import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetUpButton } from "@/components/MetUpButton";

describe("MetUpButton", () => {
  it("renders an enabled prompt before any meetup is logged", () => {
    render(<MetUpButton onLog={() => {}} />);
    const btn = screen.getByRole("button", { name: /i met up with this person/i });
    expect(btn).toBeEnabled();
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onLog once and shows the confirmation toast on click", () => {
    const onLog = vi.fn();
    render(<MetUpButton onLog={onLog} />);
    fireEvent.click(screen.getByRole("button", { name: /i met up/i }));
    expect(onLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("🤝 Connection logged!");
  });

  it("disables itself for the session after logging", () => {
    render(<MetUpButton onLog={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /i met up/i }));
    const btn = screen.getByRole("button", { name: /met up logged/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("does not call onLog again once already logged", () => {
    const onLog = vi.fn();
    render(<MetUpButton onLog={onLog} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onLog).toHaveBeenCalledTimes(1);
  });
});
