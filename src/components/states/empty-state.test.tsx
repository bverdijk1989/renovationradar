import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox, Search } from "lucide-react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title + default icon (Inbox)", () => {
    render(<EmptyState title="Geen resultaten" />);
    expect(screen.getByText("Geen resultaten")).toBeInTheDocument();
  });

  it("renders optional description", () => {
    render(
      <EmptyState
        title="Geen resultaten"
        description="Pas je filters aan."
      />,
    );
    expect(screen.getByText("Pas je filters aan.")).toBeInTheDocument();
  });

  it("renders a custom icon when supplied", () => {
    const { container } = render(
      <EmptyState icon={Search} title="Niets gevonden" />,
    );
    // lucide-react renders SVGs with a class indicating the icon name.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders an action button when supplied", () => {
    render(
      <EmptyState
        title="Geen advertenties"
        action={<button>Voeg toe</button>}
      />,
    );
    expect(screen.getByRole("button", { name: /Voeg toe/i })).toBeInTheDocument();
  });

  it("uses the brief-required Inbox icon as default", () => {
    const { container } = render(<EmptyState icon={Inbox} title="X" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
