import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorState } from "./error-state";

describe("ErrorState", () => {
  it("renders the default title when none supplied", () => {
    render(<ErrorState />);
    expect(screen.getByText(/Er ging iets mis/i)).toBeInTheDocument();
  });

  it("renders a custom title + description", () => {
    render(
      <ErrorState
        title="Netwerk fout"
        description="Kan de server niet bereiken."
      />,
    );
    expect(screen.getByText("Netwerk fout")).toBeInTheDocument();
    expect(screen.getByText("Kan de server niet bereiken.")).toBeInTheDocument();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /Opnieuw proberen/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the retry button when onRetry is not supplied", () => {
    render(<ErrorState />);
    expect(
      screen.queryByRole("button", { name: /Opnieuw proberen/i }),
    ).not.toBeInTheDocument();
  });

  it("uses role='alert' for screen readers", () => {
    render(<ErrorState />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
