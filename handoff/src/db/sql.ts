import type { DatabaseSync } from "node:sqlite";

export type Sql = {
  exec(statement: string): Promise<void>;
  run(statement: string, params?: readonly unknown[]): Promise<void>;
  all<T>(statement: string, params?: readonly unknown[]): Promise<T[]>;
  get<T>(statement: string, params?: readonly unknown[]): Promise<T | undefined>;
};

export type D1Bound = {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
  statement?: string;
  params?: readonly unknown[];
};

export type D1Like = {
  prepare(statement: string): {
    bind(...params: unknown[]): D1Bound;
  };
  exec(statement: string): Promise<unknown>;
  batch?(statements: D1Bound[]): Promise<unknown>;
};

function plainRow<T>(row: T): T {
  return { ...(row as object) } as T;
}

export function sqliteSql(db: DatabaseSync): Sql {
  return {
    async exec(statement) {
      db.exec(statement);
    },
    async run(statement, params = []) {
      db.prepare(statement).run(...params);
    },
    async all<T>(statement: string, params: readonly unknown[] = []) {
      return (db.prepare(statement).all(...params) as T[]).map((row) => plainRow(row));
    },
    async get<T>(statement: string, params: readonly unknown[] = []) {
      const row = db.prepare(statement).get(...params);
      return row == null ? undefined : plainRow(row as T);
    },
  };
}

type BufferedWrite = { statement: string; params: readonly unknown[] };

const BEGIN = /^BEGIN(?:\s+IMMEDIATE)?$/i;
const COMMIT = /^COMMIT$/i;
const ROLLBACK = /^ROLLBACK$/i;

function sqlVerb(statement: string): string {
  return statement.trim().replace(/;$/, "");
}

export function d1Sql(db: D1Like): Sql {
  let buffer: BufferedWrite[] | null = null;
  return {
    async exec(statement) {
      const verb = sqlVerb(statement);
      if (BEGIN.test(verb)) {
        if (buffer) throw new Error("transaction is already open");
        buffer = [];
        return;
      }
      if (ROLLBACK.test(verb)) {
        buffer = null;
        return;
      }
      if (COMMIT.test(verb)) {
        const pending = buffer ?? [];
        buffer = null;
        if (pending.length === 0) return;
        if (!db.batch) throw new Error("D1 batch is not available");
        await db.batch(
          pending.map((entry) =>
            Object.assign(db.prepare(entry.statement).bind(...entry.params), {
              statement: entry.statement,
              params: entry.params,
            }),
          ),
        );
        return;
      }
      if (buffer) throw new Error("transaction only accepts writes until commit");
      await db.exec(statement);
    },
    async run(statement, params = []) {
      if (buffer) {
        buffer.push({ statement, params });
        return;
      }
      await db.prepare(statement).bind(...params).run();
    },
    async all<T>(statement: string, params: readonly unknown[] = []) {
      const result = await db.prepare(statement).bind(...params).all<T>();
      return result.results;
    },
    async get<T>(statement: string, params: readonly unknown[] = []) {
      const row = await db.prepare(statement).bind(...params).first<T>();
      return row ?? undefined;
    },
  };
}
