import * as React from "react";
import { cn } from "@/lib/utils";

export function MetricStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const count = React.Children.count(children);
  const cols =
    count >= 5
      ? "lg:grid-cols-5"
      : count === 4
        ? "lg:grid-cols-4"
        : count === 3
          ? "lg:grid-cols-3"
          : "lg:grid-cols-2";

  return (
    <div
      data-slot="metric-strip"
      className={cn("grid grid-cols-2 gap-3", cols, className)}
    >
      {children}
    </div>
  );
}
