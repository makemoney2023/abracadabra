import { libraryEligibleSql } from "./project-library";

const ARTIFACT_TYPES = "'article', 'social', 'video', 'image', 'website', 'document', 'file'";

/**
 * SQL condition: a deliverable item counts as a social piece. A Library tag on the item wins, as it does in the Library
 * (an item tagged social is social, one tagged image or document is not). Without a tag, a piece is social when it names
 * a network or sits in a social-pack deliverable. A screenshot or diagram filed into a document or design deliverable is
 * an image, not social work, so it never lands in the Social rail or its counts.
 * `item` and `deliverable` are the table aliases in the calling query.
 */
export function socialPieceSql(item: string, deliverable: string): string {
  return `COALESCE(
    (SELECT CASE WHEN sm.artifact_type = 'social' THEN 1 ELSE 0 END
       FROM deliverable_artifact_metadata sm
      WHERE sm.item_id = ${item}.id AND sm.version = ${item}.version AND sm.artifact_type IN (${ARTIFACT_TYPES})
      LIMIT 1),
    CASE WHEN ${item}.channel IS NOT NULL OR ${deliverable}.kind = 'social_pack' THEN 1 ELSE 0 END
  ) = 1`;
}

/**
 * SQL condition for the Social rail and its counts: the piece is social and its project has "Add to the Library" ticked
 * (a deliverable with no project falls back to its Space's project; no project at all is included).
 */
export function socialRailSql(item: string, deliverable: string): string {
  return `(${socialPieceSql(item, deliverable)}) AND ${libraryEligibleSql(`${deliverable}.project_id`, `${deliverable}.workspace_id`)}`;
}
