import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListingFilters } from "./listing-filters";

// ---------------------------------------------------------------------------
// Mock next/navigation so the filter component can call router.replace
// without exploding outside a Next runtime.
// ---------------------------------------------------------------------------

const { mockRouter, mockUseSearchParams } = vi.hoisted(() => ({
  mockRouter: {
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  },
  mockUseSearchParams: vi.fn(() => new URLSearchParams("")),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockUseSearchParams(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
});

describe("ListingFilters — URL-sync", () => {
  it("renders all required filter fields from the brief", () => {
    render(<ListingFilters />);
    expect(screen.getByLabelText(/Zoeken/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Land/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min\. prijs/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max\. prijs/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Min\. grond/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Max\. afstand v\.a\. Venlo/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Alleen bijzondere objecten/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Renovatiestatus/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stroom/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Minimale match score/i)).toBeInTheDocument();
  });

  it("typing in the search field calls router.replace with the new query", () => {
    render(<ListingFilters />);
    fireEvent.change(screen.getByLabelText(/Zoeken/i), {
      target: { value: "watermolen" },
    });
    expect(mockRouter.replace).toHaveBeenCalled();
    const lastCall = mockRouter.replace.mock.calls.at(-1)![0];
    expect(lastCall).toContain("search=watermolen");
  });

  it("changing maxPriceEur input resets page to 1", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("page=3"));
    render(<ListingFilters />);
    fireEvent.change(screen.getByLabelText(/Max\. prijs/i), {
      target: { value: "150000" },
    });
    const url = mockRouter.replace.mock.calls.at(-1)![0];
    expect(url).toContain("maxPriceEur=150000");
    expect(url).not.toContain("page=");
  });

  it("clearing a field via empty input removes the param", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("search=watermolen&maxPriceEur=200000"),
    );
    render(<ListingFilters />);
    fireEvent.change(screen.getByLabelText(/Zoeken/i), {
      target: { value: "" },
    });
    const url = mockRouter.replace.mock.calls.at(-1)![0];
    expect(url).not.toContain("search=");
    expect(url).toContain("maxPriceEur=200000"); // unrelated param preserved
  });

  it("shows 'Wis alles' only when at least one filter is active", () => {
    // No params → no clear button.
    mockUseSearchParams.mockReturnValue(new URLSearchParams(""));
    const { rerender } = render(<ListingFilters />);
    expect(
      screen.queryByRole("button", { name: /Wis alles/i }),
    ).not.toBeInTheDocument();

    // With a param → button appears.
    mockUseSearchParams.mockReturnValue(new URLSearchParams("country=FR"));
    rerender(<ListingFilters />);
    expect(
      screen.getByRole("button", { name: /Wis alles/i }),
    ).toBeInTheDocument();
  });
});
