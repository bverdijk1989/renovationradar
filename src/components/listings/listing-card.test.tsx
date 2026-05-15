import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingCard, type ListingCardData } from "./listing-card";

// Stub Next.js's Image/Link so jsdom tests render them as plain HTML.
vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    <img src={props.src} alt={props.alt} />
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function fixture(over: Partial<ListingCardData> = {}): ListingCardData {
  return {
    id: "test-id",
    titleNl: "Watermolen te koop in de Ardennen",
    titleOriginal: "Moulin à eau à vendre",
    originalUrl: "https://example.com/listing/123",
    priceEur: 185_000,
    country: "FR",
    region: "Grand Est",
    city: "Monthermé",
    propertyType: "watermill",
    renovationStatus: "partial_renovation",
    isSpecialObject: true,
    specialObjectType: "watermill",
    electricityStatus: "present",
    waterStatus: "present",
    landAreaM2: 18_000,
    location: { distanceFromVenloKm: 215 },
    score: { matchScore: 91, compositeScore: 88 },
    media: [{ id: "m1", url: "https://example.com/photo.jpg", caption: null }],
    ...over,
  };
}

describe("ListingCard", () => {
  it("renders the Dutch title preferentially", () => {
    render(<ListingCard listing={fixture()} />);
    expect(screen.getByText("Watermolen te koop in de Ardennen")).toBeInTheDocument();
    expect(screen.queryByText("Moulin à eau à vendre")).not.toBeInTheDocument();
  });

  it("falls back to the original title when titleNl is null", () => {
    render(<ListingCard listing={fixture({ titleNl: null })} />);
    expect(screen.getByText("Moulin à eau à vendre")).toBeInTheDocument();
  });

  it("shows the special-object badge with the correct label", () => {
    render(<ListingCard listing={fixture()} />);
    // The badge contains "Watermolen" via SPECIAL_OBJECT_LABELS.
    const badges = screen.getAllByText("Watermolen");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("hides the special badge when isSpecialObject=false", () => {
    render(
      <ListingCard
        listing={fixture({ isSpecialObject: false, specialObjectType: null })}
      />,
    );
    // Score badge + price text are still present, but no special-object badge.
    // The SPECIAL_OBJECT_LABELS["watermill"] label would only appear via the
    // special badge; with the flag off, it should not appear.
    expect(screen.queryByText(/Watermolen$/)).not.toBeInTheDocument();
  });

  it("renders price, distance, land area, country", () => {
    render(<ListingCard listing={fixture()} />);
    expect(screen.getByText(/€/)).toBeInTheDocument();
    expect(screen.getByText(/215 km v\.a\. Venlo/)).toBeInTheDocument();
    expect(screen.getByText(/1,8 ha/)).toBeInTheDocument();
    expect(screen.getByText(/Frankrijk/)).toBeInTheDocument();
  });

  it("renders the match score badge with the rounded value", () => {
    render(<ListingCard listing={fixture()} />);
    expect(screen.getByLabelText(/Match score 91 van 100/)).toBeInTheDocument();
  });

  it("the 'Bekijk origineel' link points to the originalUrl with rel/target", () => {
    render(<ListingCard listing={fixture()} />);
    const link = screen.getByRole("link", { name: /Bekijk origineel/i });
    expect(link).toHaveAttribute("href", "https://example.com/listing/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows 'Geen foto beschikbaar' placeholder when media is empty", () => {
    render(<ListingCard listing={fixture({ media: [] })} />);
    expect(screen.getByText(/Geen foto beschikbaar/i)).toBeInTheDocument();
  });

  it("renders the Save and Negeer buttons", () => {
    render(<ListingCard listing={fixture()} />);
    expect(screen.getByRole("button", { name: /Bewaar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Negeer/i })).toBeInTheDocument();
  });
});
