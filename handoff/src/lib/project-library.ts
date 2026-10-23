import type { Sql } from "@/db/sql";

/**
 * Per-project Library option. The Library is part of the social pipeline (finished pieces to approve, schedule and
 * post), so a project that is not social work, print for example, can opt out when it is created or later.
 * projects.include_in_library is 1 (the default) or 0. A project that opts out keeps its files, cards and history; its
 * finished pieces, built sites and selected files just do not list in the Library, and approved pieces are not
 * auto-scheduled to social accounts.
 */

/** The project a Space belongs to, as a SQL expression for a workspace id column. */
export function spaceProjectSql(workspaceIdColumn: string): string {
  return `(SELECT lw.project_id FROM workspaces lw WHERE lw.id = ${workspaceIdColumn})`;
}

/**
 * SQL condition: the project in `projectExpr` has not opted out. A NULL or unknown project is included, so work with no
 * project of its own is never hidden by accident.
 */
export function libraryProjectOk(projectExpr: string): string {
  return `NOT EXISTS (SELECT 1 FROM projects lp WHERE lp.id = ${projectExpr} AND lp.include_in_library = 0)`;
}

/**
 * Library eligibility for a row with its own project column and a workspace column: the row's own project wins, and a
 * row with no project falls back to the project its Space belongs to.
 */
export function libraryEligibleSql(projectColumn: string, workspaceIdColumn: string): string {
  return libraryProjectOk(`COALESCE(${projectColumn}, ${spaceProjectSql(workspaceIdColumn)})`);
}

/** True unless the project exists and opted out. */
export async function projectInLibrary(sql: Sql, projectId: string | null | undefined): Promise<boolean> {
  if (!projectId) return true;
  const row = await sql.get<{ include_in_library: number }>("SELECT include_in_library FROM projects WHERE id = ?", [projectId]);
  return row?.include_in_library !== 0;
}

/**
 * Reads the Library option from a create or edit form. The form posts libraryOption=1 to say it carries the checkbox;
 * a checked box then posts includeInLibrary=on and an unchecked one posts nothing. A post without the marker (an old
 * form, a script) keeps the default: in the Library.
 */
export function includeFromForm(form: FormData): boolean {
  if (form.get("libraryOption") !== "1") return true;
  const value = form.get("includeInLibrary");
  return value === "on" || value === "1" || value === "true";
}
