import "server-only";
import type { NextRequest } from "next/server";
import type { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Write an audit log row. Best-effort: failures are logged but never thrown,
 * so a hiccup in the audit table can't break a successful mutation.
 */
export async function auditLog(input: {
  req?: NextRequest;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  meta?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        meta: (input.meta ?? null) as never,
        ip: input.req?.headers.get("x-forwarded-for") ?? null,
        userAgent: input.req?.headers.get("user-agent") ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to write audit log:", err);
  }
}
