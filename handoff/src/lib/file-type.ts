// Used by client components, so this file must not import server modules (lib/preview reads files).
function fileExtension(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** What a file is, at a glance, for the folder list. Read from the extension only, never the bytes. */
export type FileTypeKind =
  | "image"
  | "vector"
  | "design"
  | "video"
  | "pdf"
  | "markdown"
  | "html"
  | "text"
  | "document"
  | "spreadsheet"
  | "slides"
  | "data"
  | "code"
  | "font"
  | "archive"
  | "cad"
  | "other";

export type FileType = {
  kind: FileTypeKind;
  /** Plain word for the badge, like Image or Spreadsheet. */
  label: string;
  /** Upper-case extension, like PNG. Empty when the name has none. */
  extension: string;
};

const KINDS: Record<string, FileTypeKind> = {
  jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", tif: "image", tiff: "image", heic: "image", ico: "image",
  svg: "vector", ai: "vector", eps: "vector",
  psd: "design", indd: "design", fig: "design", sketch: "design",
  mp4: "video", mov: "video", webm: "video",
  pdf: "pdf",
  md: "markdown",
  html: "html", htm: "html",
  txt: "text", rtf: "text", log: "text",
  doc: "document", docx: "document",
  xls: "spreadsheet", xlsx: "spreadsheet", csv: "spreadsheet",
  ppt: "slides", pptx: "slides",
  json: "data", xml: "data", yaml: "data", yml: "data", toml: "data", ini: "data", sql: "data",
  css: "code", js: "code", mjs: "code", cjs: "code", ts: "code", tsx: "code", jsx: "code", py: "code", rb: "code", php: "code",
  java: "code", go: "code", rs: "code", cs: "code", swift: "code", kt: "code", vue: "code", svelte: "code",
  otf: "font", ttf: "font", woff: "font", woff2: "font",
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive",
  dwg: "cad", dxf: "cad",
};

const LABELS: Record<FileTypeKind, string> = {
  image: "Image",
  vector: "Vector",
  design: "Design file",
  video: "Video",
  pdf: "PDF",
  markdown: "Doc",
  html: "HTML",
  text: "Text",
  document: "Document",
  spreadsheet: "Spreadsheet",
  slides: "Slides",
  data: "Data",
  code: "Code",
  font: "Font",
  archive: "Zip",
  cad: "Drawing",
  other: "File",
};

export function fileType(name: string): FileType {
  const extension = fileExtension(name);
  const kind = KINDS[extension] ?? "other";
  return { kind, label: LABELS[kind], extension: extension.toUpperCase() };
}

/** Pictures the browser can draw as a thumbnail through the session preview route. */
export function thumbnailable(name: string): boolean {
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(fileExtension(name));
}
