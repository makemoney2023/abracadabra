import { PageFrame, type PageFrameWidth } from "@/components/page-frame";
import { Skeleton } from "@/components/ui/skeleton";

export type RouteShape = "metrics" | "table" | "board" | "thread" | "frame" | "cards" | "tabs";

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" aria-hidden>
      <div className="flex gap-4 border-b px-3 py-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b px-3 last:border-b-0"
          style={{ height: "var(--row-h)" }}
        >
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, column) => (
        <div key={column} className="space-y-3 rounded-lg border p-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ))}
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-16 w-4/5" />
      <Skeleton className="ml-auto h-16 w-3/5" />
      <Skeleton className="h-16 w-4/5" />
      <Skeleton className="h-24" />
    </div>
  );
}

function FrameSkeleton() {
  return <Skeleton className="h-[calc(100svh-3rem)] w-full" aria-hidden />;
}

function CardsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
  );
}

function TabsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-20" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

const SHAPES = {
  metrics: MetricsSkeleton,
  table: TableSkeleton,
  board: BoardSkeleton,
  thread: ThreadSkeleton,
  frame: FrameSkeleton,
  cards: CardsSkeleton,
  tabs: TabsSkeleton,
} as const;

export function RouteLoading({
  title,
  shape,
  width = "default",
  pendingTitle = false,
}: {
  title: string;
  shape: RouteShape;
  width?: PageFrameWidth;
  pendingTitle?: boolean;
}) {
  const Body = SHAPES[shape];
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <PageFrame
        title={
          pendingTitle ? <Skeleton className="h-8 w-48" aria-hidden /> : title
        }
        width={width}
      >
        <Body />
      </PageFrame>
    </div>
  );
}
