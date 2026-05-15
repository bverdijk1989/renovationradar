import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InProcessRateLimiter, NoopRateLimiter } from "./rate-limit";
import { RateLimitError } from "./errors";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("InProcessRateLimiter", () => {
  it("no-op when rateLimitPerMinute is null or 0", async () => {
    const r = new InProcessRateLimiter();
    await r.wait("s1", null);
    await r.wait("s1", 0);
    // Either should return immediately — no fake-timer advance needed.
    expect(true).toBe(true);
  });

  it("first call passes immediately, second call waits", async () => {
    const r = new InProcessRateLimiter();
    const t0 = Date.now();
    await r.wait("s1", 60); // = 1 per second
    expect(Date.now() - t0).toBeLessThan(50);

    const waitPromise = r.wait("s1", 60);
    // Should NOT resolve until ~1000ms passes.
    let resolved = false;
    waitPromise.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    await waitPromise;
    expect(resolved).toBe(true);
  });

  it("throws RateLimitError when required wait exceeds maxWaitMs", async () => {
    const r = new InProcessRateLimiter(100); // ridiculously low max
    await r.wait("s1", 1); // 1 per minute → 60s spacing
    await expect(r.wait("s1", 1)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("tracks per-source independently", async () => {
    const r = new InProcessRateLimiter();
    await r.wait("a", 60);
    // Source 'b' has its own clock — should pass immediately.
    const t0 = Date.now();
    await r.wait("b", 60);
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe("NoopRateLimiter", () => {
  it("always resolves immediately", async () => {
    vi.useRealTimers();
    const r = new NoopRateLimiter();
    const t0 = Date.now();
    await r.wait();
    expect(Date.now() - t0).toBeLessThan(20);
  });
});
