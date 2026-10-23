import type { Sql } from "@/db/sql";

const COPY_LIMIT = 8_000;

type ShelfItem = {
  section: string | null;
  format: string;
  channel: string | null;
  title: string;
  copy_text: string | null;
  media_json: string;
  link_url: string | null;
  status: string;
  sort: number;
  work_item_id: string | null;
  source_file_id: string | null;
};

/** The caption written under an image name in a filing's notes. */
export function captionForImage(notes: string, filename: string): string | null {
  const needle = filename.trim().toLowerCase();
  if (!needle || !needle.includes(".")) return null;
  const sections = notes.split(/\n(?=#{1,3} )/);
  for (const section of sections) {
    if (!section.toLowerCase().includes(needle)) continue;
    const match = section.match(/\*\*Caption:\*\*[ \t]*\n+([\s\S]*?)(?=\n\*\*[A-Za-z]|\n#{1,3} |\n---|$)/);
    const caption = match?.[1]?.trim();
    if (caption) return caption.slice(0, COPY_LIMIT);
  }
  return null;
}

function withCaption(item: ShelfItem, notes: string): string | null {
  if (item.copy_text?.trim()) return item.copy_text;
  return captionForImage(notes, item.title);
}

/**
 * Pieces from an earlier round that this revision did not replace.
 * A new round keeps every earlier piece whose title it does not file again.
 */
export function piecesToCarry(previous: ShelfItem[], incomingTitles: readonly string[], notes: string): ShelfItem[] {
  const incoming = new Set(incomingTitles);
  return previous.flatMap((item) => {
    if (incoming.has(item.title)) return [];
    return [{ ...item, copy_text: withCaption(item, notes) }];
  });
}

async function versionItems(sql: Sql, deliverableId: string, version: number): Promise<ShelfItem[]> {
  return sql.all<ShelfItem>(
    `SELECT section, format, channel, title, copy_text, media_json, link_url, status, sort, work_item_id, source_file_id
     FROM deliverable_items
     WHERE deliverable_id = ? AND version = ? AND removed_at IS NULL
     ORDER BY sort, title`,
    [deliverableId, version],
  );
}

function insertCarry(deliverableId: string, version: number, item: ShelfItem): { statement: string; params: readonly unknown[] } {
  return {
    statement: `INSERT INTO deliverable_items (
      id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort, work_item_id, source_file_id
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM deliverable_items
      WHERE deliverable_id = ? AND version = ? AND title = ?
    )`,
    params: [
      crypto.randomUUID(),
      deliverableId,
      version,
      item.section,
      item.format,
      item.channel,
      item.title,
      item.copy_text,
      item.media_json || "[]",
      item.link_url,
      item.status,
      item.sort,
      item.work_item_id,
      item.source_file_id,
      deliverableId,
      version,
      item.title,
    ],
  };
}

/** Copy untouched pieces from an earlier version onto this one. */
export async function carryForwardWrites(
  sql: Sql,
  input: { deliverableId: string; fromVersion: number; toVersion: number; incomingTitles: readonly string[]; notes: string },
): Promise<{ statement: string; params: readonly unknown[] }[]> {
  const previous = await versionItems(sql, input.deliverableId, input.fromVersion);
  return piecesToCarry(previous, input.incomingTitles, input.notes).map((item) => insertCarry(input.deliverableId, input.toVersion, item));
}

async function captionWrites(sql: Sql, deliverableId: string, version: number): Promise<{ statement: string; params: readonly unknown[] }[]> {
  const pages = await sql.all<{ copy_text: string }>(
    `SELECT copy_text FROM deliverable_items
     WHERE deliverable_id = ? AND version = ? AND copy_text IS NOT NULL AND copy_text != ''`,
    [deliverableId, version],
  );
  const notes = pages.map((page) => page.copy_text).join("\n");
  if (!notes.trim()) return [];
  const images = await sql.all<{ id: string; title: string }>(
    `SELECT id, title FROM deliverable_items
     WHERE deliverable_id = ? AND version = ? AND (copy_text IS NULL OR copy_text = '')`,
    [deliverableId, version],
  );
  return images.flatMap((image) => {
    const caption = captionForImage(notes, image.title);
    if (!caption) return [];
    return [{
      statement: "UPDATE deliverable_items SET copy_text = ? WHERE id = ? AND (copy_text IS NULL OR copy_text = '')",
      params: [caption, image.id] as const,
    }];
  });
}

/**
 * Put pieces a later round dropped back onto the published round, and fill empty picture captions
 * from the notes filed with them. Safe to run again: a title already on the round is left as it is.
 */
export async function restorePublishedShelves(sql: Sql): Promise<number> {
  const deliverables = await sql.all<{ id: string; published_version: number }>(
    "SELECT id, published_version FROM deliverables WHERE published_version IS NOT NULL AND status != 'archived'",
  );
  let copied = 0;
  for (const deliverable of deliverables) {
    const prior = await sql.get<{ version: number | null }>(
      "SELECT MAX(version) AS version FROM deliverable_items WHERE deliverable_id = ? AND version < ?",
      [deliverable.id, deliverable.published_version],
    );
    if (prior?.version == null) continue;
    const current = await versionItems(sql, deliverable.id, deliverable.published_version);
    const earlier = await versionItems(sql, deliverable.id, prior.version);
    const notes = [...earlier, ...current].map((item) => item.copy_text ?? "").join("\n");
    const writes = piecesToCarry(earlier, current.map((item) => item.title), notes).map((item) => insertCarry(deliverable.id, deliverable.published_version, item));
    if (writes.length) {
      await sql.batch(writes);
      copied += writes.length;
    }
    const captions = await captionWrites(sql, deliverable.id, deliverable.published_version);
    if (captions.length) await sql.batch(captions);
  }
  return copied;
}
