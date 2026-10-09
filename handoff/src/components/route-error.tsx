"use client";

import { ErrorState } from "@/components/error-state";

export function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
      <ErrorState onRetry={reset} />
    </div>
  );
}
