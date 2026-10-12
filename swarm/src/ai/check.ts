export type SpecialistKind = "research" | "copy" | "language" | "visual" | "skill";

export type SpecialistCheck = {
  ok: boolean;
  errors: string[];
  page: string;
};

const BANNED = [/^\s*transform your/i, /^\s*real smiles/i, /^\s*unlock/i, /^\s*discover the secret/i, /^\s*ready to/i];
const COPY_FIELDS = ["platform", "type", "hook", "body", "hashtags", "cta"];

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export function outputSchemaKeys(skillBody: string): string[] {
  const section = skillBody.split(/##\s+Output schema/i)[1];
  if (!section) return [];
  const fence = section.match(/```json\s*([\s\S]*?)```/i);
  if (!fence) return [];
  try {
    const schema = JSON.parse(fence[1]) as { required?: unknown };
    if (!Array.isArray(schema.required)) return [];
    return schema.required.filter((key): key is string => typeof key === "string" && key.length > 0);
  } catch {
    return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(row: Record<string, unknown>, key: string): string {
  const value = row[key] ?? row[key.toUpperCase()] ?? row[key.toLowerCase()];
  return typeof value === "string" ? value.trim() : "";
}

function banned(value: string): boolean {
  return BANNED.some((pattern) => pattern.test(value));
}

function isPostArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 7) return false;
  return value.every((row) => {
    const record = asRecord(row);
    return Boolean(record && textOf(record, "platform") && textOf(record, "hook"));
  });
}

function calendar(value: unknown): boolean {
  return JSON.stringify(value).toLowerCase().includes("90-day") || JSON.stringify(value).toLowerCase().includes("90 day");
}

function copyRows(value: unknown): SpecialistCheck {
  if (!Array.isArray(value)) return { ok: false, errors: ["copy must be a JSON array"], page: "" };
  if (value.length !== 7) return { ok: false, errors: [`expected 7 rows, got ${value.length}`], page: "" };
  const errors: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = asRecord(value[index]);
    if (!row) {
      errors.push(`row ${index + 1} is not an object`);
      continue;
    }
    for (const field of COPY_FIELDS) {
      if (!textOf(row, field)) errors.push(`row ${index + 1} missing ${field}`);
    }
    if (banned(textOf(row, "hook")) || banned(textOf(row, "body"))) errors.push(`row ${index + 1} uses a banned opener`);
  }
  return { ok: errors.length === 0, errors, page: errors.length === 0 ? JSON.stringify(value) : "" };
}

export function checkSpecialist(kind: SpecialistKind, raw: string, handoff = "", shape = ""): SpecialistCheck {
  const text = stripJsonFence(raw);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["not json"], page: "" };
  }
  if (calendar(data) && kind !== "copy" && kind !== "language") {
    return { ok: false, errors: ["90-day calendar"], page: "" };
  }
  if (kind === "research") {
    if (!Array.isArray(data)) return { ok: false, errors: ["research must be a JSON array"], page: "" };
    if (data.some((row) => asRecord(row) && textOf(asRecord(row)!, "platform") && textOf(asRecord(row)!, "hook"))) {
      return { ok: false, errors: ["research returned posts"], page: "" };
    }
    const kept = data.filter((row) => {
      const record = asRecord(row);
      return Boolean(record && textOf(record, "name") && textOf(record, "fact") && textOf(record, "source"));
    });
    if (kept.length === 0) return { ok: false, errors: ["no sourced row remains"], page: "" };
    return applySchema({ ok: true, errors: [], page: JSON.stringify(kept) }, shape);
  }
  if (kind === "copy" || kind === "language") {
    const checked = copyRows(data);
    if (!checked.ok) return checked;
    if (kind === "language" && handoff.trim()) {
      try {
        const prior = JSON.parse(stripJsonFence(handoff)) as unknown;
        if (Array.isArray(prior) && Array.isArray(data) && prior.length !== data.length) {
          return { ok: false, errors: ["language changed the row count"], page: "" };
        }
      } catch {
        // A missing prior page does not add a row-count error beyond the 7-row rule.
      }
    }
    return applySchema(checked, shape);
  }
  if (kind === "visual") {
    if (!Array.isArray(data)) return { ok: false, errors: ["visuals must be a JSON array"], page: "" };
    let expected = data.length;
    if (handoff.trim()) {
      try {
        const prior = JSON.parse(stripJsonFence(handoff)) as unknown;
        if (Array.isArray(prior)) expected = prior.length;
      } catch {
        expected = data.length;
      }
    }
    if (data.length !== expected) return { ok: false, errors: [`expected ${expected} visual rows`], page: "" };
    const errors: string[] = [];
    for (let index = 0; index < data.length; index += 1) {
      const row = asRecord(data[index]);
      if (!row || !textOf(row, "imagePrompt") || !textOf(row, "videoPrompt")) errors.push(`row ${index + 1} missing a prompt`);
      if (row && `${textOf(row, "imagePrompt")} ${textOf(row, "videoPrompt")}`.toLowerCase().includes("placeholder model")) {
        errors.push(`row ${index + 1} uses a placeholder model`);
      }
    }
    return applySchema({ ok: errors.length === 0, errors, page: errors.length === 0 ? JSON.stringify(data) : "" }, shape);
  }
  if (isPostArray(data)) return { ok: false, errors: ["skill returned posts"], page: "" };
  const keys = shapeKeys(shape);
  const record = asRecord(data);
  if (!record || JSON.stringify(record) === "{}") return { ok: false, errors: ["empty page"], page: "" };
  const errors = keys.filter((key) => !textOf(record, key) && record[key] == null).map((key) => `missing ${key}`);
  return applySchema({ ok: errors.length === 0, errors, page: errors.length === 0 ? JSON.stringify(record) : "" }, shape);
}

function shapeKeys(shape: string): string[] {
  const fenced = outputSchemaKeys(shape);
  if (fenced.length > 0) return fenced;
  if (shape.length > 180) return [];
  return shape
    .split(/[^A-Za-z0-9_]+/)
    .map((key) => key.trim())
    .filter((key) => key.length > 1);
}

function applySchema(result: SpecialistCheck, shape: string): SpecialistCheck {
  if (!result.ok || !result.page) return result;
  const keys = outputSchemaKeys(shape);
  if (keys.length === 0) return result;
  let data: unknown;
  try {
    data = JSON.parse(result.page);
  } catch {
    return result;
  }
  const rows = Array.isArray(data) ? data : [data];
  const errors: string[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const record = asRecord(rows[index]);
    if (!record) {
      errors.push(`row ${index + 1} is not an object`);
      continue;
    }
    for (const key of keys) {
      const value = record[key];
      if (value == null || (typeof value === "string" && value.trim() === "")) errors.push(`missing ${key}`);
    }
  }
  return errors.length === 0 ? result : { ok: false, errors, page: "" };
}
