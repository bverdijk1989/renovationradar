import { NextRequest } from "next/server";

/**
 * Construct a NextRequest pointed at a relative path. Route handlers don't
 * care about the host, so we hard-code one. Headers are forwarded; pass
 * `userId` to set the X-Dev-User-Id header used by the dev auth shim.
 */
export function makeRequest(
  method: string,
  path: string,
  init: {
    body?: unknown;
    headers?: Record<string, string>;
    userId?: string;
  } = {},
): NextRequest {
  const url = `http://test${path}`;
  const headers = new Headers(init.headers);
  if (init.userId) headers.set("x-dev-user-id", init.userId);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(url, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/** Convenience: invoke a handler and JSON-parse the response. */
export async function invoke<T = unknown>(
  handler: (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
  ) => Promise<Response> | Response,
  req: NextRequest,
  params: Record<string, string> = {},
): Promise<{ status: number; body: T }> {
  const res = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T) : (undefined as T);
  return { status: res.status, body };
}
