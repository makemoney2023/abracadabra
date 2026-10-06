export type StoreResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const REFUSED = "You cannot do that.";
