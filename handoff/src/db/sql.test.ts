import { describe, expect, it } from "vitest";
import { d1Sql, type D1Like } from "./sql";

describe("d1Sql transactions", () => {
  it("sends the writes together and does not send BEGIN", async () => {
    const execs: string[] = [];
    const reads: string[] = [];
    const batches: { statement: string; params: readonly unknown[] }[][] = [];
    const db: D1Like = {
      prepare(statement) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                reads.push(statement);
                return { results: [] };
              },
              async first<T>() {
                reads.push(statement);
                return { n: 0 } as T;
              },
              async run() {
                throw new Error(`run outside a batch: ${statement}`);
              },
              statement,
              params,
            };
          },
        };
      },
      async exec(statement) {
        execs.push(statement);
      },
      async batch(statements) {
        batches.push(
          statements.map((entry) => ({
            statement: entry.statement ?? "",
            params: entry.params ?? [],
          })),
        );
      },
    };
    const sql = d1Sql(db);
    await sql.exec("BEGIN");
    await sql.run("INSERT INTO batches (id) VALUES (?)", ["batch-1"]);
    const count = await sql.get<{ n: number }>("SELECT count(*) AS n FROM audit_events");
    await sql.run("INSERT INTO files (id) VALUES (?)", ["file-1"]);
    await sql.exec("COMMIT");
    expect(count).toEqual({ n: 0 });
    expect(execs).toEqual([]);
    expect(reads).toEqual(["SELECT count(*) AS n FROM audit_events"]);
    expect(batches).toEqual([
      [
        { statement: "INSERT INTO batches (id) VALUES (?)", params: ["batch-1"] },
        { statement: "INSERT INTO files (id) VALUES (?)", params: ["file-1"] },
      ],
    ]);
  });

  it("drops a rolled-back transaction", async () => {
    let batched = 0;
    const db: D1Like = {
      prepare(statement) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                return { results: [] };
              },
              async first() {
                return null;
              },
              async run() {
                throw new Error(`run outside a batch: ${statement} ${params.length}`);
              },
              statement,
              params,
            };
          },
        };
      },
      async exec() {
        throw new Error("exec should not run");
      },
      async batch() {
        batched += 1;
      },
    };
    const sql = d1Sql(db);
    await sql.exec("BEGIN IMMEDIATE");
    await sql.run("INSERT INTO batches (id) VALUES (?)", ["batch-1"]);
    await sql.exec("ROLLBACK");
    await sql.exec("COMMIT");
    expect(batched).toBe(0);
  });
});
