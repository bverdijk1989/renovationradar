import { TransportError } from "./errors";
import type { HttpResponse, HttpTransport } from "./types";

/**
 * Playwright-backed transport voor JS-rendered sites. Drop-in vervanging
 * voor FetchTransport — implementeert dezelfde HttpTransport interface,
 * dus connectors hoeven niet te weten of de site server-rendered of
 * client-rendered is.
 *
 * Strategie:
 *   - Lazy-launch een gedeelde Chromium browser bij eerste fetch
 *   - Per request: nieuwe BrowserContext (isolatie) + newPage
 *   - Wachten op `networkidle` zodat JS klaar is met data laden
 *   - Page.content() als HTML-body
 *   - close() de hele browser pas bij `dispose()` (eind van batch)
 *
 * Vereist:
 *   - CHROMIUM_PATH env var (gezet door deploy/install-playwright.sh)
 *   - playwright-core in deps + chromium-browser via apt
 *
 * Performance: ~3-8s per page (vs ~0.5s voor static fetch). Cap je
 * batches dus lager dan bij FetchTransport.
 */
export class RenderedFetchTransport implements HttpTransport {
  private browser: import("playwright-core").Browser | null = null;
  private launching: Promise<import("playwright-core").Browser> | null = null;

  constructor(
    private readonly opts: {
      userAgent?: string;
      executablePath?: string;
      timeoutMs?: number;
      /** networkidle wacht tot 500ms geen requests; "load" is sneller maar mist async-fetched content. */
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
    } = {},
  ) {}

  private async ensureBrowser(): Promise<import("playwright-core").Browser> {
    if (this.browser) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      // Dynamic import zodat de Next.js build niet faalt als playwright-core
      // (nog) niet beschikbaar is. De connector controleert ondertussen op
      // `process.env.CHROMIUM_PATH` voordat 'ie een fetch via deze transport
      // probeert.
      const { chromium } = await import("playwright-core");
      const executablePath = this.opts.executablePath ?? process.env.CHROMIUM_PATH;
      if (!executablePath) {
        throw new TransportError(
          "RenderedFetchTransport vereist CHROMIUM_PATH env var (zie deploy/install-playwright.sh)",
        );
      }
      const browser = await chromium.launch({
        executablePath,
        // Server draait Chromium meestal als root in een container, geen
        // user-namespace sandbox beschikbaar.
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
      this.browser = browser;
      return browser;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  async get(
    url: string,
    opts: {
      headers?: Record<string, string>;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<HttpResponse> {
    const timeoutMs = opts.timeoutMs ?? this.opts.timeoutMs ?? 30_000;
    const userAgent = opts.headers?.["User-Agent"] ?? this.opts.userAgent;

    let browser;
    try {
      browser = await this.ensureBrowser();
    } catch (err) {
      throw new TransportError(
        `Chromium kon niet opstarten: ${(err as Error).message}`,
      );
    }

    const context = await browser.newContext({
      userAgent,
      extraHTTPHeaders: opts.headers,
      // België-/NL-default voor cookie-banners die op locale reageren.
      locale: "nl-BE",
    });
    try {
      const page = await context.newPage();
      const onAbort = () => {
        page.close().catch(() => {});
      };
      opts.signal?.addEventListener("abort", onAbort, { once: true });

      let finalUrl = url;
      let status = 200;
      try {
        const response = await page.goto(url, {
          waitUntil: this.opts.waitUntil ?? "networkidle",
          timeout: timeoutMs,
        });
        if (response) {
          status = response.status();
          finalUrl = response.url();
        }
        if (status >= 400) {
          throw new TransportError(
            `HTTP ${status} fetching ${url} (rendered)`,
            { status },
          );
        }
        // Scroll naar onderen om Intersection-Observer-/lazy-load
        // images te triggeren. Veel modern real-estate sites
        // (Century21, Immoweb) tonen property-foto's pas wanneer ze
        // in-viewport komen. Korte timeout om eindeloos te wachten te
        // voorkomen als de scroll-handler faalt.
        await page.evaluate(async () => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          const total = document.documentElement.scrollHeight;
          let y = 0;
          const step = 400;
          while (y < total) {
            window.scrollTo(0, y);
            await sleep(150);
            y += step;
          }
          window.scrollTo(0, document.documentElement.scrollHeight);
          await sleep(500);
        }).catch(() => {});
        // Extra wacht-tijd voor de net-getriggerde fetches om HTML te
        // updaten met de geladen image-URLs.
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
      } catch (err) {
        opts.signal?.removeEventListener("abort", onAbort);
        if (err instanceof TransportError) throw err;
        throw new TransportError(
          `Rendered fetch faalde voor ${url}: ${(err as Error).message}`,
        );
      }

      const body = await page.content();
      opts.signal?.removeEventListener("abort", onAbort);

      return {
        status,
        headers: { "content-type": "text/html; charset=utf-8" },
        body,
        url: finalUrl,
      };
    } finally {
      await context.close().catch(() => {});
    }
  }

  /**
   * Sluit de browser. Call dit aan het eind van een batch om resources vrij
   * te geven. Volgende fetch start de browser opnieuw.
   */
  async dispose(): Promise<void> {
    const b = this.browser;
    this.browser = null;
    if (b) {
      await b.close().catch(() => {});
    }
  }
}
