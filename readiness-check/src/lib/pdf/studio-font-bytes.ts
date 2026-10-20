import { STUDIO_PDF_FONT_FILES, type StudioFontBytes } from "@/lib/pdf/scan-report-pdf";

type AssetsBinding = { fetch: (input: Request | string) => Promise<Response> };

/**
 * Brand fonts for the PDF. On the Worker they come from the static assets
 * (public/pdf-fonts); under Node (tests, local) from assets/fonts. Missing fonts
 * are null and the report uses Helvetica.
 */
export async function loadStudioFontBytes(assets?: AssetsBinding | null, origin = "https://assets.local"): Promise<StudioFontBytes> {
  const entries = await Promise.all(
    Object.entries(STUDIO_PDF_FONT_FILES).map(async ([role, file]) => [role, await loadOne(file, assets, origin)] as const),
  );
  return Object.fromEntries(entries) as StudioFontBytes;
}

async function loadOne(file: string, assets: AssetsBinding | null | undefined, origin: string): Promise<Uint8Array | null> {
  if (assets) {
    try {
      const res = await assets.fetch(new Request(`${origin}/pdf-fonts/${file}`));
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      // try the filesystem
    }
  }
  try {
    const [{ readFile }, { join }] = await Promise.all([import("node:fs/promises"), import("node:path")]);
    return new Uint8Array(await readFile(join(process.cwd(), "assets/fonts", file)));
  } catch {
    return null;
  }
}
