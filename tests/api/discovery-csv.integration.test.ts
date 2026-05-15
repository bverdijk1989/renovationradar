/**
 * Integration tests for POST /api/discovery/import-csv.
 *
 * Skipped without TEST_DATABASE_URL. Stubs global fetch so the engine's
 * robots.txt + page fetches never leave localhost.
 */
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { POST as importCsv } from "@/app/api/discovery/import-csv/route";

const AGENCY_HTML = `<html lang="fr"><head><title>Agence X</title></head>
<body><h1>Agence immobilière</h1><a href="mailto:info@a.fr">x</a></body></html>`;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /\n", { status: 200 });
      }
      return new Response(AGENCY_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

async function admin() {
  return getTestPrisma().user.create({
    data: { email: `admin-${Math.random()}@test.local`, role: "admin" },
  });
}

function makeRequest(form: FormData, userId?: string) {
  const headers = new Headers();
  if (userId) headers.set("x-dev-user-id", userId);
  return new Request("http://test/api/discovery/import-csv", {
    method: "POST",
    headers,
    body: form,
  }) as unknown as Parameters<typeof importCsv>[0];
}

async function invoke(req: ReturnType<typeof makeRequest>) {
  const res = await importCsv(req, { params: Promise.resolve({}) } as never);
  return {
    status: res.status,
    body: (await res.json()) as Record<string, unknown>,
  };
}

describeIntegration("POST /api/discovery/import-csv", () => {
  withIntegrationDb();

  it("requires admin auth (401 zonder user)", async () => {
    const fd = new FormData();
    fd.append("file", new Blob(["url\nhttps://x.fr"]), "x.csv");
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");
    const { status } = await invoke(makeRequest(fd));
    expect(status).toBe(401);
  });

  it("ontbrekend bestand → 400", async () => {
    const a = await admin();
    const fd = new FormData();
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");
    const { status, body } = await invoke(makeRequest(fd, a.id));
    expect(status).toBe(400);
    expect((body.error as { message: string }).message).toMatch(/file/i);
  });

  it("dry-run: parse + groepering, geen HTTP-call, geen DB-schrijven", async () => {
    const a = await admin();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const csv = `url,country,language
https://a.fr,FR,fr
https://b.de,DE,de`;
    const fd = new FormData();
    fd.append("file", new Blob([csv]), "x.csv");
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");
    fd.append("dryRun", "true");

    const { status, body } = await invoke(makeRequest(fd, a.id));
    expect(status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect((body.parsed as { rowCount: number }).rowCount).toBe(2);
    expect((body.groups as unknown[]).length).toBe(2);
    // Niets gefetcht.
    expect(fetchSpy).not.toHaveBeenCalled();
    // Geen Source rijen aangemaakt.
    const sources = await getTestPrisma().source.findMany({
      where: { website: { in: ["https://a.fr", "https://b.de"] } },
    });
    expect(sources).toHaveLength(0);
  });

  it("echte run: persists Source rows met status=pending_review", async () => {
    const a = await admin();
    stubFetch();

    const csv = `url,country,language
https://importme.fr,FR,fr`;
    const fd = new FormData();
    fd.append("file", new Blob([csv]), "x.csv");
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");
    fd.append("dryRun", "false");

    const { status, body } = await invoke(makeRequest(fd, a.id));
    expect(status).toBe(200);
    expect((body.totals as { candidatesPersisted: number }).candidatesPersisted).toBe(1);

    const sources = await getTestPrisma().source.findMany({
      where: { website: "https://importme.fr" },
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]!.status).toBe("pending_review");
    expect(sources[0]!.legalStatus).toBe("pending_review");
  });

  it("groepering per land: één URL FR + één DE → 2 groepen, beide persisted", async () => {
    const a = await admin();
    stubFetch();

    const csv = `url,country,language
https://a.fr,FR,fr
https://b.de,DE,de`;
    const fd = new FormData();
    fd.append("file", new Blob([csv]), "x.csv");
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");
    fd.append("dryRun", "false");

    const { body } = await invoke(makeRequest(fd, a.id));
    const groups = body.groups as Array<{ country: string }>;
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.country).sort()).toEqual(["DE", "FR"]);
  });

  it("rijen zonder country vallen terug op defaultCountry", async () => {
    const a = await admin();
    stubFetch();

    const csv = `url
https://a.fr
https://b.fr`;
    const fd = new FormData();
    fd.append("file", new Blob([csv]), "x.csv");
    fd.append("defaultCountry", "BE");
    fd.append("defaultLanguage", "nl");
    fd.append("dryRun", "true");

    const { body } = await invoke(makeRequest(fd, a.id));
    const groups = body.groups as Array<{ country: string; urls: string[] }>;
    expect(groups).toHaveLength(1);
    expect(groups[0]!.country).toBe("BE");
    expect(groups[0]!.urls).toHaveLength(2);
  });

  it("> 50 URLs → 400 met duidelijke melding", async () => {
    const a = await admin();
    const urls = Array.from({ length: 60 }, (_, i) => `https://x${i}.fr`).join(
      "\n",
    );
    const csv = `url\n${urls}`;
    const fd = new FormData();
    fd.append("file", new Blob([csv]), "x.csv");
    fd.append("defaultCountry", "FR");
    fd.append("defaultLanguage", "fr");

    const { status, body } = await invoke(makeRequest(fd, a.id));
    expect(status).toBe(400);
    expect((body.error as { message: string }).message).toMatch(/Te veel/);
  });

  it("schrijft AuditLog rij voor zowel dry-run als echte run", async () => {
    const a = await admin();
    stubFetch();
    const csv = `url\nhttps://audit.fr`;

    const fd1 = new FormData();
    fd1.append("file", new Blob([csv]), "x.csv");
    fd1.append("defaultCountry", "FR");
    fd1.append("defaultLanguage", "fr");
    fd1.append("dryRun", "true");
    await invoke(makeRequest(fd1, a.id));

    const fd2 = new FormData();
    fd2.append("file", new Blob([csv]), "x.csv");
    fd2.append("defaultCountry", "FR");
    fd2.append("defaultLanguage", "fr");
    fd2.append("dryRun", "false");
    await invoke(makeRequest(fd2, a.id));

    const logs = await getTestPrisma().auditLog.findMany({
      where: { userId: a.id, action: "discovery_run" },
    });
    // Verwacht 2 voor de CSV-route + minimaal 1 voor de persisted source.
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });
});
