import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = {
  avif: { mime: "image/avif", ext: "avif" },
  webp: { mime: "image/webp", ext: "webp" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
} as const;

type ServerFormat = keyof typeof FORMATS;

const MAX_INPUT_BYTES = 32 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let format: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    format = formData.get("format") as string | null;
    const qualityRaw = formData.get("quality");

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image file" }, { status: 400 });
    }
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    if (!format || !(format in FORMATS)) {
      return NextResponse.json(
        { error: `Unsupported format: ${format ?? "(none)"}` },
        { status: 400 }
      );
    }
    const quality = Math.min(100, Math.max(1, Number(qualityRaw) || 80));

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const pipeline = sharp(inputBuffer, { failOn: "none" });
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      return NextResponse.json({ error: "Unreadable image" }, { status: 400 });
    }

    const target = FORMATS[format as ServerFormat];
    let output: Buffer;
    switch (format as ServerFormat) {
      case "avif":
        output = await pipeline.avif({ quality }).toBuffer();
        break;
      case "webp":
        output = await pipeline.webp({ quality }).toBuffer();
        break;
      case "jpeg":
        output = await pipeline.jpeg({ quality }).toBuffer();
        break;
      case "png":
        output = await pipeline.png().toBuffer();
        break;
    }

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": target.mime,
        "Content-Disposition": `attachment; filename="openvid-export.${target.ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`Image export encoding failed (${format}):`, error);
    return NextResponse.json({ error: "Encoding failed" }, { status: 500 });
  }
}
