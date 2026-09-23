import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateFixPackage,
  listFixOptions,
  type FixPackageInput,
  type FixSelection,
} from "@/lib/fixes/generate-package";
import { computeRequiredFields } from "@/lib/fixes/required-fields";
import { fixPackageFolderName, zipFixFiles } from "@/lib/fixes/zip";
import { loadScanByPublicToken } from "@/lib/scan/supabase-repository";
import { isOrganizationType } from "@/lib/schema-org/organization-types";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ token: string }> };

const faqPairSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(4000),
});

const addressSchema = z.object({
  streetAddress: z.string().max(200).optional(),
  addressLocality: z.string().max(120).optional(),
  addressRegion: z.string().max(120).optional(),
  postalCode: z.string().max(40).optional(),
  addressCountry: z.string().max(80).optional(),
});

const selectionSchema = z.object({
  llmsTxt: z.boolean().optional(),
  llmsFullTxt: z.boolean().optional(),
  sitemapXml: z.boolean().optional(),
  robotsTxt: z.boolean().optional(),
  faqJsonLd: z.boolean().optional(),
  pageUrls: z.array(z.string().url()).optional(),
  businessName: z.string().min(1).max(200).optional(),
  businessType: z
    .string()
    .max(80)
    .refine((v) => isOrganizationType(v) || v === "SoftwareApplication", {
      message: "businessType must be a schema.org Organization subtype or SoftwareApplication",
    })
    .optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  sameAs: z.array(z.string().url()).optional(),
  includeSearchAction: z.boolean().optional(),
  searchUrlTemplate: z.string().max(500).optional(),
  openingHours: z.array(z.string().max(120)).max(14).optional(),
  address: addressSchema.optional(),
  faqPairs: z.array(faqPairSchema).optional(),
  format: z.enum(["zip", "json"]).optional().default("zip"),
});

async function loadCompleteScan(token: string) {
  const admin = createAdminClient();
  let loaded: Awaited<ReturnType<typeof loadScanByPublicToken>>;
  try {
    loaded = await loadScanByPublicToken(token, admin);
  } catch (err) {
    return {
      error: NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to load scan" },
        { status: 500 },
      ),
    };
  }

  if (!loaded) {
    return { error: NextResponse.json({ error: "Scan not found" }, { status: 404 }) };
  }

  if (loaded.scan.status !== "complete") {
    return {
      error: NextResponse.json(
        {
          error: "Scan not complete",
          message: "Wait for the scan to finish before exporting fixes",
        },
        { status: 409 },
      ),
    };
  }

  return { loaded };
}

function toInput(
  loaded: NonNullable<Awaited<ReturnType<typeof loadScanByPublicToken>>>,
): FixPackageInput {
  return {
    domain: loaded.scan.domain,
    origin: loaded.scan.origin,
    // Leave unset so listFixOptions prefers extracted brand name from page evidence
    findings: loaded.findings,
    pages: loaded.pages.map((p) => ({
      url: p.url,
      pageType: p.pageType,
      fetchStatus: p.fetchStatus,
      hasJsonLd: p.hasJsonLd,
      evidence: p.evidence,
    })),
  };
}

/** List selectable fix options (no email unlock — internal / on-the-fly). */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await loadCompleteScan(token);
  if ("error" in result && result.error) return result.error;

  const input = toInput(result.loaded!);
  const { options, defaultSelection, prefills } = listFixOptions(input);
  const requiredFields = computeRequiredFields(input, {
    ...defaultSelection,
    businessType: prefills.businessType,
    email: prefills.email,
    phone: prefills.phone,
    logoUrl: prefills.logoUrl,
    includeSearchAction: prefills.hasSiteSearch,
  });

  return NextResponse.json({
    domain: input.domain,
    options,
    defaultSelection,
    prefills,
    requiredFields,
  });
}

/** Generate zip/JSON for the user's selected fixes (no email unlock). */
export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await loadCompleteScan(token);
  if ("error" in result && result.error) return result.error;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = selectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid selection", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = toInput(result.loaded!);
  const selection: FixSelection = {
    llmsTxt: parsed.data.llmsTxt,
    llmsFullTxt: parsed.data.llmsFullTxt,
    sitemapXml: parsed.data.sitemapXml,
    robotsTxt: parsed.data.robotsTxt,
    faqJsonLd: parsed.data.faqJsonLd,
    pageUrls: parsed.data.pageUrls,
    businessName: parsed.data.businessName,
    businessType: parsed.data.businessType,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone,
    logoUrl: parsed.data.logoUrl || undefined,
    sameAs: parsed.data.sameAs,
    includeSearchAction: parsed.data.includeSearchAction,
    searchUrlTemplate: parsed.data.searchUrlTemplate,
    openingHours: parsed.data.openingHours,
    address: parsed.data.address,
    faqPairs: parsed.data.faqPairs,
  };

  const requiredFields = computeRequiredFields(input, selection);
  if (requiredFields.length > 0) {
    return NextResponse.json(
      {
        error: "Required fields missing",
        message: "Fill required fields before downloading a fix package",
        requiredFields,
      },
      { status: 422 },
    );
  }

  const pkg = generateFixPackage(input, selection);

  if (!pkg.validation.ok || pkg.validation.todoCount > 0) {
    return NextResponse.json(
      {
        error: "Package validation failed",
        message: "Generated package failed offline validation (including zero-TODO)",
        validation: pkg.validation,
        requiredFields: pkg.requiredFields,
      },
      { status: 422 },
    );
  }

  if (parsed.data.format === "json") {
    return NextResponse.json({
      domain: pkg.domain,
      findingsAddressed: pkg.findingsAddressed,
      selection: pkg.selection,
      validation: pkg.validation,
      mergeNotes: pkg.mergeNotes,
      requiredFields: pkg.requiredFields,
      files: pkg.files,
    });
  }

  const folder = fixPackageFolderName(result.loaded!.scan.domain);
  const zipBytes = await zipFixFiles(pkg.files, folder);

  return new NextResponse(Buffer.from(zipBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
