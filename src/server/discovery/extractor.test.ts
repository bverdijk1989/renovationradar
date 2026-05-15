import { describe, it, expect } from "vitest";
import { extract } from "./extractor";

const RICH_HTML = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <title>Agence du Vieux Moulin | Lorraine</title>
  <meta property="og:site_name" content="Agence du Vieux Moulin">
</head>
<body>
  <h1>Bienvenue</h1>
  <p>Contact: <a href="mailto:contact@vieuxmoulin.fr">contact@vieuxmoulin.fr</a></p>
  <p>Tel: <a href="tel:+33 6 12 34 56 78">06 12 34 56 78</a></p>
  <nav>
    <a href="/biens">Nos biens</a>
    <a href="/about">À propos</a>
  </nav>
  <address>Bar-le-Duc, Lorraine</address>
</body>
</html>
`;

describe("extractor", () => {
  it("extracts name from og:site_name preferentially", () => {
    const r = extract({ url: "https://vieuxmoulin.fr/", html: RICH_HTML });
    expect(r.name).toBe("Agence du Vieux Moulin");
  });

  it("falls back to <title> minus the suffix when og:site_name is absent", () => {
    const html = `<html><head><title>Immo Eifel - Ihre Makler</title></head></html>`;
    const r = extract({ url: "https://immo-eifel.de/", html });
    expect(r.name).toBe("Immo Eifel");
  });

  it("extracts language from <html lang='fr'>", () => {
    const r = extract({ url: "https://x.fr/", html: RICH_HTML });
    expect(r.language).toBe("fr");
  });

  it("hint language wins over extracted", () => {
    const r = extract({ url: "https://x.fr/", html: RICH_HTML, hintLanguage: "nl" });
    expect(r.language).toBe("nl");
  });

  it("extracts email from mailto: link, prefers same-domain role address", () => {
    const r = extract({ url: "https://vieuxmoulin.fr/", html: RICH_HTML });
    expect(r.email).toBe("contact@vieuxmoulin.fr");
  });

  it("does NOT extract email from plain text (only mailto: links)", () => {
    const html = `<html><body><p>Contact: john.doe@example.com</p></body></html>`;
    expect(extract({ url: "https://x/", html }).email).toBeNull();
  });

  it("extracts phone from tel: link and strips ornaments", () => {
    const r = extract({ url: "https://x/", html: RICH_HTML });
    expect(r.phone).toBe("+33612345678");
  });

  it("finds a listing-page URL via /biens", () => {
    const r = extract({ url: "https://vieuxmoulin.fr/", html: RICH_HTML });
    expect(r.listingPageUrl).toBe("https://vieuxmoulin.fr/biens");
  });

  it("returns null fields when HTML is empty", () => {
    const r = extract({ url: "https://x/", html: "" });
    expect(r.email).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.listingPageUrl).toBeNull();
  });
});
