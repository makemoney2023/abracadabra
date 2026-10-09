/**
 * The return shape for HQ server actions that run inside a form drawer.
 *
 * Actions keep their database writes and redirects where they are; they only
 * swap `throw`/`redirect` for a returned result so `ActionForm` can show a
 * toast, mark a field, or close a drawer without a full page swap.
 */
export type ActionSuccess = { ok: true; message: string };
export type ActionFailure = { ok: false; error: string; field?: string };
export type ActionResult = ActionSuccess | ActionFailure;

export function ok(message: string): ActionSuccess {
  return { ok: true, message };
}

export function fail(error: string, field?: string): ActionFailure {
  return field ? { ok: false, error, field } : { ok: false, error };
}

export function isOk(result: ActionResult): result is ActionSuccess {
  return result.ok;
}
