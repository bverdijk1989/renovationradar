import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { DEV_COOKIE, getCurrentUser } from "@/server/api/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loginAs(formData: FormData) {
  "use server";
  const userId = formData.get("userId");
  if (typeof userId !== "string") return;
  cookies().set(DEV_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/");
}

async function logout() {
  "use server";
  cookies().delete(DEV_COOKIE);
  redirect("/login");
}

export default async function LoginPage() {
  const current = await getCurrentUser();
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    take: 50,
  });

  return (
    <div>
      <PageHeader
        title="Dev login"
        description="Tijdelijk login-mechanisme voor fase 3. Echte NextAuth wordt later toegevoegd."
      />

      {current ? (
        <Card className="mb-6 max-w-md">
          <CardHeader>
            <CardTitle className="text-base">Ingelogd als</CardTitle>
            <CardDescription>{current.email ?? current.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={logout}>
              <Button type="submit" variant="outline">Uitloggen</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {users.length === 0 ? (
        <Card className="max-w-md p-6 text-sm text-muted-foreground">
          Geen gebruikers. Maak er een via:
          <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
            $env:SEED_DEV_ADMIN_EMAIL = &quot;jij@example.com&quot;
            <br />
            pnpm db:seed
          </pre>
        </Card>
      ) : (
        <div className="grid max-w-2xl gap-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-medium">{u.email ?? "(geen email)"}</p>
                  <p className="text-xs text-muted-foreground">{u.id}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                    {u.role}
                  </Badge>
                  <form action={loginAs}>
                    <input type="hidden" name="userId" value={u.id} />
                    <Button
                      type="submit"
                      size="sm"
                      variant={current?.id === u.id ? "secondary" : "default"}
                    >
                      {current?.id === u.id ? "Actief" : "Inloggen"}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
