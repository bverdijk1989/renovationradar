import { describe, it, expect } from "vitest";
import { classify } from "./classifier";

describe("classifier", () => {
  it("known portal domains classify as portal even with thin HTML", () => {
    const r = classify({ url: "https://www.immoweb.be/en/search", html: "" });
    expect(r.classification).toBe("portal");
    expect(r.evidence.some((e) => e.includes("known-portal"))).toBe(true);
  });

  it("agency keywords + mailto + small page → real_estate_agency", () => {
    const html = `
      <html>
        <head><title>Agence Immobilière du Vieux Moulin</title></head>
        <body>
          <h1>Agence immobilière à Bar-le-Duc</h1>
          <p>Spécialisée dans le rural.</p>
          <a href="mailto:contact@vieuxmoulin.fr">Contact</a>
        </body>
      </html>
    `;
    const r = classify({ url: "https://vieuxmoulin.fr/", html });
    expect(r.classification).toBe("real_estate_agency");
    expect(r.evidence.some((e) => e.includes("agence immobilière"))).toBe(true);
    expect(r.evidence.some((e) => e.includes("mailto"))).toBe(true);
  });

  it("portal signals win over generic agency words", () => {
    const html = `
      <html><body>
        <h1>Immobilier en France</h1>
        <p>Découvrez nos milliers d'annonces partout en France.</p>
        <select><option>1</option>${"<option>x</option>".repeat(60)}</select>
      </body></html>
    `;
    const r = classify({ url: "https://example.fr/", html });
    expect(r.classification).toBe("portal");
  });

  it("Dutch makelaar text → real_estate_agency", () => {
    const html = `
      <html><body>
        <h1>Vastgoedkantoor De Hoeve</h1>
        <p>Uw makelaar in Wallonië voor landelijk vastgoed.</p>
      </body></html>
    `;
    const r = classify({ url: "https://dehoeve.be/", html });
    expect(r.classification).toBe("real_estate_agency");
  });

  it("German Immobilienmakler text → real_estate_agency", () => {
    const html = `
      <html><body>
        <h1>Immobilien Müller</h1>
        <p>Ihr Immobilienmakler für die Eifel.</p>
      </body></html>
    `;
    const r = classify({ url: "https://immobilien-mueller.de/", html });
    expect(r.classification).toBe("real_estate_agency");
  });

  it("irrelevant signals → irrelevant", () => {
    const html = `<html><body><h1>Webshop</h1><p>In den Warenkorb</p></body></html>`;
    const r = classify({ url: "https://shop.de/", html });
    expect(r.classification).toBe("irrelevant");
  });

  it("no signal → unknown with confidence 0", () => {
    const r = classify({ url: "https://example.com/", html: "<html><body>x</body></html>" });
    expect(r.classification).toBe("unknown");
    expect(r.confidence).toBe(0);
  });

  it("sub-domain of a known portal still classifies as portal", () => {
    const r = classify({
      url: "https://wallonie.immoweb.be/",
      html: "<html><body>x</body></html>",
    });
    expect(r.classification).toBe("portal");
  });
});
