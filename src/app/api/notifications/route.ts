import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { listUserNotifications } from "@/server/alerts";

const QuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) =>
      v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    )
    .pipe(
      z
        .array(z.enum(["pending", "dispatched", "acknowledged", "failed"]))
        .optional(),
    ),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const q = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const data = await listUserNotifications(user.id, q);
  return ok({ data, count: data.length });
});
