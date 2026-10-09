import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ExternalLink } from "@/components/external-link";
import { cn } from "@/lib/utils";

/**
 * Chat and note body. Raw HTML is dropped. Web links leave through
 * ExternalLink; in-app links stay on the Next router.
 */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      data-slot="markdown"
      className={cn(
        "space-y-3 text-sm leading-relaxed text-foreground",
        "[&_h1]:font-heading [&_h1]:text-xl [&_h1]:font-medium",
        "[&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-medium",
        "[&_h3]:font-heading [&_h3]:text-base [&_h3]:font-medium",
        "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
        "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs",
        "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:p-3",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
    >
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: label }) => {
            if (!href) return <>{label}</>;
            if (/^https?:\/\//i.test(href)) return <ExternalLink href={href}>{label}</ExternalLink>;
            return (
              <Link href={href} className="underline-offset-4 hover:underline">
                {label}
              </Link>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
