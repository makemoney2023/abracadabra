export type AttentionRow = { id: string; kind: string; platform: string };

export type OperationsPost = {
  id: string;
  title: string;
  platform: string;
  state: string;
  at: number;
  timezone: string;
  thumbnailRole: string;
};

const RECOVERY: Record<string, "connect" | "retry"> = {
  disconnected_account: "connect",
  upload_failure: "retry",
};

function localTime(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(at));
}

/**
 * Staff operations layout. Attention is first. The calendar is day, week, or month.
 * A narrow screen opens on the day. Move and Cancel stay the direct staff path.
 */
export function operationsView(input: { narrow: boolean; attention: AttentionRow[]; posts: OperationsPost[] }): {
  sections: string[];
  recoveries: { id: string; action: "connect" | "retry" | null }[];
  calendar: { mode: "day" | "week" | "month"; modes: ["day", "week", "month"] };
  filters: ["account", "platform", "collection", "status"];
  cards: (OperationsPost & { localTime: string })[];
  queueActions: { action: "move" | "cancel" | "retry"; opens: "plan_review"; mutatesDirectly: false }[];
  reachable: ["account_health", "cadence", "history"];
} {
  return {
    sections: ["attention", "calendar", "queue"],
    recoveries: input.attention.map((item) => ({ id: item.id, action: RECOVERY[item.kind] ?? null })),
    calendar: { mode: input.narrow ? "day" : "week", modes: ["day", "week", "month"] },
    filters: ["account", "platform", "collection", "status"],
    cards: input.posts.map((post) => ({ ...post, localTime: localTime(post.at, post.timezone) })),
    queueActions: [
      { action: "move", opens: "plan_review", mutatesDirectly: false },
      { action: "cancel", opens: "plan_review", mutatesDirectly: false },
      { action: "retry", opens: "plan_review", mutatesDirectly: false },
    ],
    reachable: ["account_health", "cadence", "history"],
  };
}
