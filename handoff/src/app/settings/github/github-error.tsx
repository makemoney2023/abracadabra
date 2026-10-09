"use client";

import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/error-state";

export function GithubError() {
  const router = useRouter();
  return (
    <ErrorState
      title="GitHub did not answer."
      detail="Try again."
      onRetry={() => router.refresh()}
    />
  );
}
