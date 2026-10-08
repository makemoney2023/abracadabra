/** Node's built-in sqlite module is newer than the installed Node type package. */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
    };
  }
}
