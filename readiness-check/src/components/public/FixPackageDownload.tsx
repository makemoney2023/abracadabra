"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessType, FaqPair } from "@/lib/facts/types";
import {
  FEATURED_ORGANIZATION_TYPES,
  isLocalBusinessFamily,
  listOrganizationTypes,
} from "@/lib/schema-org/organization-types";
import type { FixOption, FixSelection } from "@/lib/fixes/generate-package";
import type { RequiredField } from "@/lib/fixes/required-fields";

export type FixPackageDownloadProps = {
  token: string;
  domain: string;
};

type OptionsResponse = {
  domain: string;
  options: FixOption[];
  defaultSelection: Required<
    Pick<
      FixSelection,
      "llmsTxt" | "llmsFullTxt" | "sitemapXml" | "robotsTxt" | "faqJsonLd" | "pageUrls"
    >
  >;
  prefills?: {
    businessName: string;
    businessType: BusinessType;
    businessTypeLabel?: string;
    businessTypeAuto?: boolean;
    email?: string;
    phone?: string;
    logoUrl?: string;
    hasSiteSearch: boolean;
    sameAs?: string[];
    openingHours?: string[];
    searchUrlTemplate?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
      postalCode?: string;
      addressCountry?: string;
    };
  };
  requiredFields?: RequiredField[];
  error?: string;
  message?: string;
};

const ALL_ORG_TYPES = listOrganizationTypes().map((t) => t.name);
const BUSINESS_TYPE_OPTIONS: BusinessType[] = [
  ...FEATURED_ORGANIZATION_TYPES,
  "SoftwareApplication",
  ...ALL_ORG_TYPES.filter((n) => !(FEATURED_ORGANIZATION_TYPES as readonly string[]).includes(n)),
];

export function FixPackageDownload({ token, domain }: FixPackageDownloadProps) {
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<FixOption[] | null>(null);
  const [serverRequired, setServerRequired] = useState<RequiredField[]>([]);
  const [businessName, setBusinessName] = useState(domain);
  const [businessType, setBusinessType] = useState<BusinessType>("Organization");
  const [businessTypeLabel, setBusinessTypeLabel] = useState<string | undefined>();
  const [businessTypeAuto, setBusinessTypeAuto] = useState(false);
  const [changeBusinessType, setChangeBusinessType] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [addressLocality, setAddressLocality] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [faqPairs, setFaqPairs] = useState<FaqPair[]>([{ question: "", answer: "" }]);
  const [includeSearchAction, setIncludeSearchAction] = useState(false);
  const [searchUrlTemplate, setSearchUrlTemplate] = useState("");
  const [sameAsText, setSameAsText] = useState("");
  const [openingHoursText, setOpeningHoursText] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [mergeNotes, setMergeNotes] = useState<string[]>([]);
  const [llmsTxt, setLlmsTxt] = useState(false);
  const [llmsFullTxt, setLlmsFullTxt] = useState(false);
  const [sitemapXml, setSitemapXml] = useState(false);
  const [robotsTxt, setRobotsTxt] = useState(false);
  const [faqJsonLd, setFaqJsonLd] = useState(false);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loading = options === null && !error;

  function applyOptions(data: OptionsResponse) {
    setOptions(data.options);
    setLlmsTxt(data.defaultSelection.llmsTxt);
    setLlmsFullTxt(data.defaultSelection.llmsFullTxt);
    setSitemapXml(data.defaultSelection.sitemapXml);
    setRobotsTxt(data.defaultSelection.robotsTxt);
    setFaqJsonLd(data.defaultSelection.faqJsonLd);
    setPageUrls(data.defaultSelection.pageUrls);
    setServerRequired(data.requiredFields ?? []);
    if (data.prefills) {
      setBusinessName(data.prefills.businessName || domain);
      setBusinessType(data.prefills.businessType);
      setBusinessTypeLabel(data.prefills.businessTypeLabel);
      setBusinessTypeAuto(Boolean(data.prefills.businessTypeAuto));
      setChangeBusinessType(false);
      setEmail(data.prefills.email ?? "");
      setPhone(data.prefills.phone ?? "");
      setLogoUrl(data.prefills.logoUrl ?? "");
      setIncludeSearchAction(data.prefills.hasSiteSearch);
      setSameAsText((data.prefills.sameAs ?? []).join("\n"));
      setOpeningHoursText((data.prefills.openingHours ?? []).join("\n"));
      setSearchUrlTemplate(data.prefills.searchUrlTemplate ?? "");
      const addr = data.prefills.address;
      if (addr) {
        setStreetAddress(addr.streetAddress ?? "");
        setAddressLocality(addr.addressLocality ?? "");
        setAddressRegion(addr.addressRegion ?? "");
        setPostalCode(addr.postalCode ?? "");
        setAddressCountry(addr.addressCountry ?? "");
      }
    }
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scans/${token}/fixes`)
      .then(async (res) => {
        const data = (await res.json()) as OptionsResponse;
        if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to load fix options");
        if (cancelled) return;
        applyOptions(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOptions([]);
        setError(err instanceof Error ? err.message : "Failed to load fix options");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per token
  }, [token, domain]);

  const missingPages = useMemo(
    () =>
      (options ?? []).filter(
        (o): o is FixOption & { url: string } =>
          o.kind === "pageSchema" && Boolean(o.url) && o.group !== "additive",
      ),
    [options],
  );
  const additivePages = useMemo(
    () =>
      (options ?? []).filter(
        (o): o is FixOption & { url: string } =>
          o.kind === "pageSchema" && Boolean(o.url) && o.group === "additive",
      ),
    [options],
  );

  const selectedCount =
    Number(llmsTxt) +
    Number(llmsFullTxt) +
    Number(sitemapXml) +
    Number(robotsTxt) +
    Number(faqJsonLd) +
    pageUrls.length;

  const needsAddress =
    isLocalBusinessFamily(businessType) &&
    pageUrls.some((url) => {
      const opt = (options ?? []).find((o) => o.url === url);
      return opt?.pageType === "home";
    });

  const filteredTypes = useMemo(() => {
    const q = typeQuery.trim().toLowerCase();
    if (!q) return BUSINESS_TYPE_OPTIONS.slice(0, 40);
    return BUSINESS_TYPE_OPTIONS.filter((t) => t.toLowerCase().includes(q)).slice(0, 80);
  }, [typeQuery]);

  const usableFaqPairs = faqPairs.filter((p) => p.question.trim() && p.answer.trim());
  const localRequired: RequiredField[] = [];
  if (needsAddress) {
    if (!streetAddress.trim()) {
      localRequired.push({
        id: "streetAddress",
        label: "Street address",
        reason: `${businessType} schema needs a street address`,
      });
    }
    if (!addressLocality.trim()) {
      localRequired.push({
        id: "addressLocality",
        label: "City",
        reason: `${businessType} schema needs a city / locality`,
      });
    }
    if (!addressCountry.trim()) {
      localRequired.push({
        id: "addressCountry",
        label: "Country",
        reason: `${businessType} schema needs a country code`,
      });
    }
  }
  if (faqJsonLd && usableFaqPairs.length === 0) {
    localRequired.push({
      id: "faqPairs",
      label: "FAQ question & answer",
      reason: "FAQPage JSON-LD needs at least one real Q&A pair",
    });
  }

  const requiredFields =
    localRequired.length > 0
      ? localRequired
      : serverRequired.filter((f) => {
          if (f.id === "faqPairs" && usableFaqPairs.length > 0) return false;
          if (f.id === "streetAddress" && streetAddress.trim()) return false;
          if (f.id === "addressLocality" && addressLocality.trim()) return false;
          if (f.id === "addressCountry" && addressCountry.trim()) return false;
          return true;
        });

  const canDownload = selectedCount > 0 && requiredFields.length === 0 && !pending;

  function togglePage(url: string, checked: boolean) {
    setPageUrls((prev) => {
      if (checked) return prev.includes(url) ? prev : [...prev, url];
      return prev.filter((u) => u !== url);
    });
  }

  function selectionBody(format: "zip" | "json") {
    return {
      llmsTxt,
      llmsFullTxt,
      sitemapXml,
      robotsTxt,
      faqJsonLd,
      pageUrls,
      businessName: businessName.trim() || domain,
      businessType,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
      includeSearchAction,
      searchUrlTemplate: searchUrlTemplate.trim() || undefined,
      sameAs: sameAsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s)),
      openingHours: openingHoursText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 14),
      address: needsAddress
        ? {
            streetAddress: streetAddress.trim() || undefined,
            addressLocality: addressLocality.trim() || undefined,
            addressRegion: addressRegion.trim() || undefined,
            postalCode: postalCode.trim() || undefined,
            addressCountry: addressCountry.trim() || undefined,
          }
        : undefined,
      faqPairs: faqJsonLd ? usableFaqPairs : undefined,
      format,
    };
  }

  async function refreshFacts() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/scans/${token}/fixes/refresh`, { method: "POST" });
      const data = (await res.json()) as OptionsResponse & { refreshedUrls?: string[] };
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Refresh failed");
      applyOptions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function download(format: "zip" | "json") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/scans/${token}/fixes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(selectionBody(format)),
      });

      if (!res.ok) {
        const data = (await res.json()) as {
          message?: string;
          error?: string;
          requiredFields?: RequiredField[];
        };
        if (data.requiredFields) setServerRequired(data.requiredFields);
        throw new Error(data.message ?? data.error ?? "Export failed");
      }

      if (format === "json") {
        const data = (await res.json()) as { mergeNotes?: string[] };
        if (Array.isArray(data.mergeNotes)) setMergeNotes(data.mergeNotes);
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        triggerDownload(blob, `aeo-fixes-${domain}.json`);
        return;
      }

      setMergeNotes([]);

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      triggerDownload(blob, match?.[1] ?? `aeo-fixes-${domain}.zip`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="fix-package"
      className="min-w-0 max-w-full space-y-5 overflow-hidden rounded-md border border-accent/40 bg-accent/5 px-4 py-6 sm:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
            Fix package
          </p>
          <h3 className="font-heading text-2xl tracking-tight">Generate &amp; download fixes</h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            Packages never invent placeholders. Fill any required fields, then download.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer"
          disabled={refreshing || pending}
          onClick={() => refreshFacts()}
        >
          {refreshing ? "Refreshing…" : "Refresh facts from site"}
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading fix options…</p> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fix-business-name">Business name</Label>
              <Input
                id="fix-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fix-business-type">Business type</Label>
              {businessTypeAuto && !changeBusinessType ? (
                <div className="space-y-2 rounded-md border border-border/70 bg-muted/30 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">
                    {businessTypeLabel ?? businessType}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Auto-detected from your site. Schema.org type:{" "}
                    <span className="font-mono">{businessType}</span> (boards of trade /
                    chambers use Organization — no manual subtype needed).
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 cursor-pointer px-0 text-xs"
                    onClick={() => setChangeBusinessType(true)}
                  >
                    Change type
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    id="fix-type-filter"
                    value={typeQuery}
                    onChange={(e) => setTypeQuery(e.target.value)}
                    className="h-10"
                    placeholder="Search types — Physician, Restaurant, NGO…"
                  />
                  <select
                    id="fix-business-type"
                    className="flex h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                  >
                    {!filteredTypes.includes(businessType) ? (
                      <option value={businessType}>{businessType}</option>
                    ) : null}
                    {filteredTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="fix-email">Email</Label>
              <Input
                id="fix-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                placeholder="optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fix-phone">Phone</Label>
              <Input
                id="fix-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-10"
                placeholder="optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fix-logo">Logo URL</Label>
              <Input
                id="fix-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                className="h-10"
                placeholder="https://…"
              />
            </div>
            <div className="flex items-end pb-1 sm:col-span-2">
              <FixCheck
                id="fix-search-action"
                checked={includeSearchAction}
                onCheckedChange={setIncludeSearchAction}
                label="Include WebSite SearchAction"
                description="Only when a real search URL template is available"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fix-search-url">Search URL template</Label>
              <Input
                id="fix-search-url"
                value={searchUrlTemplate}
                onChange={(e) => setSearchUrlTemplate(e.target.value)}
                className="h-10"
                placeholder="https://example.com/search?q={search_term_string}"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fix-sameas">sameAs profiles (one URL per line)</Label>
              <textarea
                id="fix-sameas"
                value={sameAsText}
                onChange={(e) => setSameAsText(e.target.value)}
                className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="https://linkedin.com/company/…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fix-hours">Opening hours (optional)</Label>
              <textarea
                id="fix-hours"
                value={openingHoursText}
                onChange={(e) => setOpeningHoursText(e.target.value)}
                className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Mo-Fr 09:00-17:00"
              />
            </div>
          </div>

          {needsAddress ? (
            <fieldset className="space-y-3 rounded-md border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Address (required for {businessType})
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="fix-street">Street</Label>
                  <Input
                    id="fix-street"
                    value={streetAddress}
                    onChange={(e) => setStreetAddress(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fix-city">City</Label>
                  <Input
                    id="fix-city"
                    value={addressLocality}
                    onChange={(e) => setAddressLocality(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fix-region">Region / state</Label>
                  <Input
                    id="fix-region"
                    value={addressRegion}
                    onChange={(e) => setAddressRegion(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fix-postal">Postal code</Label>
                  <Input
                    id="fix-postal"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fix-country">Country</Label>
                  <Input
                    id="fix-country"
                    value={addressCountry}
                    onChange={(e) => setAddressCountry(e.target.value)}
                    className="h-10"
                    placeholder="US"
                  />
                </div>
              </div>
            </fieldset>
          ) : null}

          {(options ?? []).some((o) => o.kind === "siteFile" || o.kind === "schema") ? (
            <fieldset className="space-y-3">
              <legend className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Site files & FAQ
              </legend>
              <ul className="space-y-2">
                {(options ?? []).some((o) => o.id === "llmsTxt") ? (
                  <FixCheck
                    id="fix-llms"
                    checked={llmsTxt}
                    onCheckedChange={setLlmsTxt}
                    label="llms.txt"
                    description="AI discovery file for the site root"
                  />
                ) : null}
                {(options ?? []).some((o) => o.id === "llmsFullTxt") ? (
                  <FixCheck
                    id="fix-llms-full"
                    checked={llmsFullTxt}
                    onCheckedChange={setLlmsFullTxt}
                    label="llms-full.txt"
                    description="Expanded AI discovery file"
                  />
                ) : null}
                {(options ?? []).some((o) => o.id === "sitemapXml") ? (
                  <FixCheck
                    id="fix-sitemap"
                    checked={sitemapXml}
                    onCheckedChange={setSitemapXml}
                    label="sitemap.xml"
                    description="URL sitemap from scanned pages"
                  />
                ) : null}
                {(options ?? []).some((o) => o.id === "robotsTxt") ? (
                  <FixCheck
                    id="fix-robots"
                    checked={robotsTxt}
                    onCheckedChange={setRobotsTxt}
                    label="robots.txt"
                    description="Allow major AI crawlers"
                  />
                ) : null}
                {(options ?? []).some((o) => o.id === "faqJsonLd") ? (
                  <FixCheck
                    id="fix-faq"
                    checked={faqJsonLd}
                    onCheckedChange={setFaqJsonLd}
                    label="FAQPage JSON-LD"
                    description="Requires at least one real Q&A pair"
                  />
                ) : null}
              </ul>
            </fieldset>
          ) : null}

          {faqJsonLd ? (
            <fieldset className="space-y-3 rounded-md border border-border/60 p-3">
              <legend className="px-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                FAQ pairs
              </legend>
              {faqPairs.map((pair, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`faq-q-${index}`}>Question</Label>
                    <Input
                      id={`faq-q-${index}`}
                      value={pair.question}
                      onChange={(e) => {
                        const next = [...faqPairs];
                        next[index] = { ...pair, question: e.target.value };
                        setFaqPairs(next);
                      }}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`faq-a-${index}`}>Answer</Label>
                    <Input
                      id={`faq-a-${index}`}
                      value={pair.answer}
                      onChange={(e) => {
                        const next = [...faqPairs];
                        next[index] = { ...pair, answer: e.target.value };
                        setFaqPairs(next);
                      }}
                      className="h-10"
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setFaqPairs((prev) => [...prev, { question: "", answer: "" }])}
              >
                Add pair
              </Button>
            </fieldset>
          ) : null}

          {missingPages.length > 0 ? (
            <PageGroup
              title={`Missing JSON-LD (${missingPages.length})`}
              pages={missingPages}
              pageUrls={pageUrls}
              togglePage={togglePage}
              onSelectAll={() => setPageUrls((prev) => [...new Set([...prev, ...missingPages.map((o) => o.url)])])}
              onClear={() =>
                setPageUrls((prev) => prev.filter((u) => !missingPages.some((o) => o.url === u)))
              }
            />
          ) : null}

          {additivePages.length > 0 ? (
            <PageGroup
              title={`Partial / additive (${additivePages.length})`}
              pages={additivePages}
              pageUrls={pageUrls}
              togglePage={togglePage}
              onSelectAll={() =>
                setPageUrls((prev) => [...new Set([...prev, ...additivePages.map((o) => o.url)])])
              }
              onClear={() =>
                setPageUrls((prev) => prev.filter((u) => !additivePages.some((o) => o.url === u)))
              }
            />
          ) : null}

          {missingPages.length === 0 && additivePages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No page schema gaps in this scan.</p>
          ) : null}

          <Accordion type="single" collapsible className="max-w-2xl">
            <AccordionItem value="install">
              <AccordionTrigger className="text-sm">Install tips (WordPress / static / Next.js)</AccordionTrigger>
              <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                <p>Zip includes INSTALL.md with a path-mapping table. Install home JSON-LD first so #organization / #website anchors resolve.</p>
                <p>WordPress: upload site files via SFTP/File Manager to the web root; paste snippets with a header script plugin (avoid theme file editor).</p>
                <p>Next.js: put robots/llms/sitemap in public/; inject JSON-LD in layout or page head.</p>
                <p>Merge robots AI rules — do not blindly replace custom Disallow rules.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {mergeNotes.length > 0 ? (
            <div className="max-w-2xl rounded-md border border-border/60 bg-background/60 p-3 text-sm">
              <p className="font-medium">Merge notes from last JSON export</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                {mergeNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {requiredFields.length > 0 ? (
            <div
              className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-3"
              role="status"
            >
              <p className="text-sm font-medium text-destructive">
                {requiredFields.length} field{requiredFields.length === 1 ? "" : "s"} needed before
                download
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {requiredFields.map((f) => (
                  <li key={f.id}>
                    <span className="font-medium text-foreground">{f.label}</span> — {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="cursor-pointer"
              disabled={!canDownload}
              onClick={() => download("zip")}
            >
              {pending ? "Preparing…" : `Download selected (${selectedCount})`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={!canDownload}
              onClick={() => download("json")}
            >
              Export JSON
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function PageGroup({
  title,
  pages,
  pageUrls,
  togglePage,
  onSelectAll,
  onClear,
}: {
  title: string;
  pages: Array<FixOption & { url: string }>;
  pageUrls: string[];
  togglePage: (url: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </legend>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onSelectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
      <ul className="max-h-64 max-w-full space-y-2 overflow-y-auto overflow-x-hidden pr-1">
        {pages.map((opt) => (
          <FixCheck
            key={opt.id}
            id={`fix-page-${opt.url}`}
            checked={pageUrls.includes(opt.url)}
            onCheckedChange={(checked) => togglePage(opt.url, checked)}
            label={opt.label}
            description={opt.url}
            badge={opt.willAdd?.length ? `will add: ${opt.willAdd.join(", ")}` : undefined}
          />
        ))}
      </ul>
    </fieldset>
  );
}

function FixCheck({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  badge,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description: string;
  badge?: string;
}) {
  return (
    <li className="flex max-w-full items-start gap-3 overflow-hidden rounded-md border border-border/60 px-3 py-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5 shrink-0 cursor-pointer"
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <Label
          htmlFor={id}
          className="block cursor-pointer break-words text-sm font-medium [overflow-wrap:anywhere]"
        >
          {label}
        </Label>
        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
        {badge ? (
          <p className="mt-1 text-xs text-muted-foreground">{badge}</p>
        ) : null}
      </div>
    </li>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
