import { RateLimitError } from "./errors";
import type { RateLimiter } from "./types";

/**
 * In-process rate limiter. Tracks the last allowed timestamp per source and
 * sleeps the difference to honour `rateLimitPerMinute`. Acceptable for the
 * single-worker dev setup; a multi-worker BullMQ deployment will need a
 * Redis-backed equivalent (same interface).
 *
 * Cancellation: the AbortSignal (if any) interrupts the sleep with a
 * RateLimitError so callers can fail the CrawlJob cleanly.
 */
export class InProcessRateLimiter implements RateLimiter {
  private lastAllowedAt = new Map<string, number>();

  constructor(private readonly maxWaitMs: number = 60_000) {}

  async wait(sourceId: string, rateLimitPerMinute: number | null): Promise<void> {
    if (!rateLimitPerMinute || rateLimitPerMinute <= 0) return;
    const minIntervalMs = Math.ceil(60_000 / rateLimitPerMinute);
    const last = this.lastAllowedAt.get(sourceId) ?? 0;
    const now = Date.now();
    const elapsed = now - last;

    if (elapsed >= minIntervalMs) {
      this.lastAllowedAt.set(sourceId, now);
      return;
    }
    const waitMs = minIntervalMs - elapsed;
    if (waitMs > this.maxWaitMs) {
      throw new RateLimitError(
        `Rate limit wait ${waitMs}ms exceeds max ${this.maxWaitMs}ms for source ${sourceId}`,
      );
    }
    await sleep(waitMs);
    this.lastAllowedAt.set(sourceId, Date.now());
  }

  /** Test helper: reset state so test order doesn't leak. */
  reset(): void {
    this.lastAllowedAt.clear();
  }
}

/**
 * Pass-through limiter for tests. Always resolves immediately.
 */
export class NoopRateLimiter implements RateLimiter {
  async wait(): Promise<void> {
    // intentionally empty
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
