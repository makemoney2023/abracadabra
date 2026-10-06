import type { DatabaseSync } from "node:sqlite";

export type Sql = {
  exec(statement: string): Promise<void>;
  run(statement: string, params?: readonly unknown[]): Promise<void>;
  all<T>(statement: string, params?: readonly unknown[]): Promise<T[]>;
  get<T>(statement: string, params?: readonly unknown[]): Promise<T | undefined>;
};

export type D1Like = {
  prepare(statement: string): {
    bind(...params: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
  exec(statement: string): Promise<unknown>;
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

export function d1Sql(db: D1Like): Sql {
  return {
    async exec(statement) {
      await db.exec(statement);
    },
    async run(statement, params = []) {
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
