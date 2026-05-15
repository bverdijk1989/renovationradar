import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { NotFoundError } from "@/server/api/http";
import { acknowledgeNotification } from "@/server/alerts";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const row = await acknowledgeNotification(user.id, id);
  if (!row) throw new NotFoundError("Notification");
  return ok(row);
});
