import type { HttpTransport } from "@/server/connectors";

/**
 * Tiny robots.txt parser + check, focused on the rules we care about:
 *   - User-agent groups (matches literal name or '*')
 *   - Allow / Disallow path rules (longest match wins)
 *
 * Why hand-roll? The `robots-parser` npm package is ~60kb + has its own
 * quirks. Our subset (no sitemap parsing, no crawl-delay, just path-allow)
 * is ~30 lines.
 *
 * Robots.txt is a politeness layer, not a security mechanism. We treat it
 * as authoritative: if the rule says disallow, we DO NOT FETCH. Period.
 */

export type RobotsCheck = {
  allowed: boolean;
  /** "disallowed by '/private'" or "no matching rule" or "fetch failed" */
  evidence: string;
};

/**
 * Fetch robots.txt and decide whether `targetUrl` may be fetched by `userAgent`.
 *
 * Returns allowed=true on:
 *   - robots.txt not present (404) — by spec everything is allowed
 *   - no matching User-agent group
 *   - matched group has no Disallow that covers the path
 *
 * Returns allowed=false on:
 *   - any matching Disallow rule
 *
 * If fetching robots.txt itself fails (network error, 5xx) we treat it as
 * BLOCKED to fail closed. Better to skip a candidate than to crawl in
 * violation by accident.
 */
export async function checkRobots(
  targetUrl: string,
  userAgent: string,
  transport: HttpTransport,
): Promise<RobotsCheck> {
  let origin: string;
  let path: string;
  try {
    const u = new URL(targetUrl);
    origin = `${u.protocol}//${u.host}`;
    path = u.pathname + u.search;
  } catch {
    return { allowed: false, evidence: `ongeldige URL: ${targetUrl}` };
  }

  const robotsUrl = `${origin}/robots.txt`;
  let body: string;
  try {
    const res = await transport.get(robotsUrl, {
      timeoutMs: 5_000,
      headers: { "User-Agent": userAgent },
    });
    body = res.body;
  } catch (err) {
    // TransportError on 404 → no robots.txt → everything allowed.
    const message = (err as Error).message ?? "";
    if (message.includes("HTTP 404")) {
      return { allowed: true, evidence: "geen robots.txt → standaard toegestaan" };
    }
    return {
      allowed: false,
      evidence: `kon robots.txt niet ophalen (fail closed): ${message}`,
    };
  }

  return decide(body, userAgent, path);
}

/** Pure decision function: exposed for tests so we don't need a transport. */
export function decide(robotsBody: string, userAgent: string, path: string): RobotsCheck {
  const groups = parseGroups(robotsBody);
  // Pick the matching group: exact UA match first, then '*'.
  const exact = groups.find((g) => g.userAgents.some((ua) => normalize(ua) === normalize(userAgent)));
  const wildcard = groups.find((g) => g.userAgents.includes("*"));
  const group = exact ?? wildcard;
  if (!group) {
    return { allowed: true, evidence: "geen matchende User-agent groep" };
  }

  // Longest matching rule wins (robots.txt standard).
  let best: { rule: Rule; len: number } | null = null;
  for (const rule of group.rules) {
    if (matchesPath(path, rule.path) && (best == null || rule.path.length > best.len)) {
      best = { rule, len: rule.path.length };
    }
  }
  if (!best) {
    return { allowed: true, evidence: "geen matchende regel" };
  }
  return {
    allowed: best.rule.kind === "allow",
    evidence: `${best.rule.kind === "allow" ? "toegestaan" : "geblokkeerd"} door ${best.rule.kind === "allow" ? "Allow" : "Disallow"}: ${best.rule.path}`,
  };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

type Rule = { kind: "allow" | "disallow"; path: string };
type Group = { userAgents: string[]; rules: Rule[] };

function parseGroups(body: string): Group[] {
  const lines = body.split(/\r?\n/);
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value);
      lastWasAgent = true;
    } else if ((key === "disallow" || key === "allow") && current) {
      // An empty Disallow is "allow all" per spec; skip persisting it
      // because no rule is needed.
      if (key === "disallow" && value === "") {
        lastWasAgent = false;
        continue;
      }
      current.rules.push({ kind: key, path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function normalize(ua: string): string {
  return ua.toLowerCase().trim();
}

function matchesPath(path: string, rule: string): boolean {
  if (rule === "") return false;
  // Robots.txt path rules are PREFIX matches. We don't implement wildcards
  // ('$', '*' inside rules) — they're rare for the agency-discovery use case.
  return path.startsWith(rule);
}
