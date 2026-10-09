import { NextResponse } from "next/server";
import { listOrganizations } from "@/db/crm";
import { requireHqStaffPage } from "@/lib/current";

export const dynamic = "force-dynamic";

/** Client names for the command palette. Anyone who is not HQ staff gets 404. */
export async function GET() {
  const { sql, caller } = await requireHqStaffPage();
  const orgs = await listOrganizations(sql, caller);
  return NextResponse.json({
    clients: orgs.map((org) => ({ id: org.id, name: org.name })),
  });
}
