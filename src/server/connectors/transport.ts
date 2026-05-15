import { TransportError } from "./errors";
import type { HttpResponse, HttpTransport } from "./types";

/**
 * Default HTTP transport: thin wrapper around fetch() that converts non-2xx
 * responses into TransportError (with status + body preview) and applies a
 * default timeout.
 */
export class FetchTransport implements HttpTransport {
  constructor(
    private readonly defaults: {
      userAgent: string;
      timeoutMs: number;
    } = {
      userAgent:
        "RenovationRadar/0.1 (+https://renovationradar.example; contact: admin@example.com)",
      timeoutMs: 15_000,
    },
  ) {}

  async get(
    url: string,
    opts: {
      headers?: Record<string, string>;
      signal?: AbortSignal;
      timeoutMs?: number;
    } = {},
  ): Promise<HttpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("timeout")),
      opts.timeoutMs ?? this.defaults.timeoutMs,
    );
    // Honour upstream cancellation too.
    if (opts.signal) {
      opts.signal.addEventListener("abort", () => controller.abort(opts.signal!.reason), {
        once: true,
      });
    }
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.defaults.userAgent,
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html;q=0.5",
          ...(opts.headers ?? {}),
        },
        signal: controller.signal,
        redirect: "follow",
      });
      const body = await res.text();
      if (!res.ok) {
        throw new TransportError(
          `HTTP ${res.status} fetching ${url}`,
          { status: res.status, bodyPreview: body.slice(0, 500) },
        );
      }
      return {
        status: res.status,
        headers: Object.fromEntries(res.headers),
        body,
        url: res.url || url,
      };
    } catch (err) {
      if (err instanceof TransportError) throw err;
      throw new TransportError(
        `Network failure fetching ${url}: ${(err as Error).message}`,
        { cause: String(err) },
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Mock transport for tests. Accepts a map of URL → response, or a function
 * that resolves URLs to responses. Throws on unmapped URLs to fail loud.
 */
export class MockTransport implements HttpTransport {
  constructor(
    private readonly handler:
      | Record<string, Partial<HttpResponse> & { body: string }>
      | ((url: string) => Partial<HttpResponse> & { body: string }),
  ) {}

  async get(url: string): Promise<HttpResponse> {
    const raw =
      typeof this.handler === "function"
        ? this.handler(url)
        : this.handler[url];
    if (!raw) {
      throw new TransportError(`MockTransport: no fixture for ${url}`);
    }
    return {
      status: raw.status ?? 200,
      headers: raw.headers ?? { "content-type": "application/xml" },
      body: raw.body,
      url: raw.url ?? url,
    };
  }
}
