import type { D1Like } from "@/db/sql";
import type { FilesBucket } from "@/lib/store/objects";

const KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

type QueryBody = {
  op?: "all" | "first" | "run" | "exec";
  sql?: string;
  params?: unknown[];
};

type BatchBody = {
  statements?: { sql?: string; params?: unknown[] }[];
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Turns a container HTTP call into a D1 query. The database binding stays in the Worker. */
export async function handleDatabaseRequest(request: Request, db: D1Like): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method is not allowed" }, 405);
  let body: QueryBody & BatchBody;
  try {
    body = (await request.json()) as QueryBody & BatchBody;
  } catch {
    return json({ error: "query is not json" }, 400);
  }
  const path = new URL(request.url).pathname;
  try {
    if (path === "/batch") {
      if (!Array.isArray(body.statements) || !db.batch) return json({ error: "batch is not available" }, 400);
      await db.batch(
        body.statements.map((entry) => {
          if (typeof entry.sql !== "string") throw new Error("statement is missing");
          const params = entry.params ?? [];
          return Object.assign(db.prepare(entry.sql).bind(...params), {
            statement: entry.sql,
            params,
          });
        }),
      );
      return json({ ok: true });
    }
    if (path !== "/query") return json({ error: "not found" }, 404);
    if (typeof body.sql !== "string" || !body.op) return json({ error: "query is incomplete" }, 400);
    const params = body.params ?? [];
    if (body.op === "exec") {
      await db.exec(body.sql);
      return json({ ok: true });
    }
    const bound = db.prepare(body.sql).bind(...params);
    if (body.op === "all") {
      const result = await bound.all();
      return json({ results: result.results });
    }
    if (body.op === "first") return json({ result: await bound.first() });
    if (body.op === "run") {
      await bound.run();
      return json({ ok: true });
    }
    return json({ error: "query is incomplete" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "database request failed";
    return json({ error: message }, 500);
  }
}

/** Turns a container HTTP call into an R2 read or delete. The key must be three ids. */
export async function handleObjectRequest(request: Request, bucket: FilesBucket): Promise<Response> {
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ""));
  if (!KEY.test(key)) return new Response(null, { status: 404 });
  if (request.method === "HEAD") {
    const head = await bucket.head(key);
    if (!head) return new Response(null, { status: 404 });
    return new Response(null, { status: 200, headers: { "content-length": String(head.size) } });
  }
  if (request.method === "GET") {
    const object = await bucket.get(key);
    if (!object) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(await object.arrayBuffer()));
  }
  if (request.method === "DELETE") {
    await bucket.delete(key);
    return new Response(null, { status: 204 });
  }
  return new Response(null, { status: 405 });
}
