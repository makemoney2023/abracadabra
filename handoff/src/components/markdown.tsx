import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExternalLink } from "@/components/external-link";
import { cn } from "@/lib/utils";

const BASE = [
  "space-y-3 text-sm leading-relaxed text-foreground",
  "[&_h1]:font-heading [&_h1]:text-xl [&_h1]:font-medium",
  "[&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-medium",
  "[&_h3]:font-heading [&_h3]:text-base [&_h3]:font-medium",
  "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
  "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:p-3",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
];

/**
 * Long-form reading (client-facing finished work). Headings step down one level so the page title stays on top,
 * long links wrap instead of pushing the page sideways on a phone, and rules and tables get room.
 */
const PROSE = [
  "flex flex-col gap-4 text-[0.9375rem] leading-7 text-foreground/90 [overflow-wrap:anywhere]",
  "[&_h1]:mt-4 [&_h1]:font-heading [&_h1]:text-xl [&_h1]:leading-snug [&_h1]:text-foreground first:[&_h1]:mt-0",
  "[&_h2]:mt-3 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:leading-snug [&_h2]:text-foreground first:[&_h2]:mt-0",
  "[&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-foreground",
  "[&_h4]:text-sm [&_h4]:font-medium [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-muted-foreground",
  "[&_strong]:font-medium [&_strong]:text-foreground",
  "[&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_li]:pl-1",
  "[&_li::marker]:text-muted-foreground",
  "[&_a]:text-optic [&_a]:underline-offset-4",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-optic/60 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-2 [&_hr]:border-border",
  "[&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_td]:border-b [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
];

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

/**
 * Chat, note, and finished-work body. Raw HTML is dropped (skipHtml) and react-markdown's URL filter removes
 * javascript: and other unsafe schemes. Web links leave through ExternalLink (new tab, no referrer); in-app links
 * stay on the Next router; other schemes (mailto:) are plain anchors.
 * - images: false shows a picture's alt text instead of loading an outside image.
 * - fileLinks: lower-case file name -> in-page href; an inline `name.png` that names a file on the page links to it.
 */
export function Markdown({
  children,
  className,
  variant = "default",
  images = true,
  fileLinks,
}: {
  children: string;
  className?: string;
  variant?: "default" | "prose";
  images?: boolean;
  fileLinks?: Record<string, string>;
}) {
  return (
    <div data-slot="markdown" data-variant={variant} className={cn(...(variant === "prose" ? PROSE : BASE), className)}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => {
            if (!href) return <>{label}</>;
            if (/^https?:\/\//i.test(href)) return <ExternalLink href={href}>{label}</ExternalLink>;
            if (href.startsWith("/") && !href.startsWith("//")) {
              return (
                <Link href={href} className="underline-offset-4 hover:underline">
                  {label}
                </Link>
              );
            }
            if (href.startsWith("#") || /^mailto:/i.test(href)) {
              return (
                <a href={href} className="underline-offset-4 hover:underline">
                  {label}
                </a>
              );
            }
            return <>{label}</>;
          },
          ...(images
            ? {}
            : { img: ({ alt }: { alt?: string }) => (alt ? <span className="text-muted-foreground">[{alt}]</span> : null) }),
          code: ({ className: codeClass, children: code }) => {
            const name = textOf(code).trim().toLowerCase();
            const href = !codeClass && fileLinks ? fileLinks[name] : undefined;
            if (href) {
              return (
                <a href={href} className="underline-offset-4 hover:underline" data-file-link>
                  <code>{code}</code>
                </a>
              );
            }
            return <code className={codeClass}>{code}</code>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
