import { NextResponse } from "next/server";

export function libraryResponse(
  result: ({ ok: true } & Record<string, unknown>) | { ok: false; status: number; reasonCode: string; message: string },
) {
  if (!result.ok) return NextResponse.json({ error: result.message, reasonCode: result.reasonCode }, { status: result.status });
  const body = Object.fromEntries(Object.entries(result).filter(([key]) => key !== "ok"));
  return NextResponse.json(Object.keys(body).length > 0 ? body : { ok: true });
}
