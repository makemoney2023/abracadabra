"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { PLATFORM_LABEL } from "@/lib/zernio";
import { approvalTone, calendarStatusLabel, type ApprovalTone } from "./social-board";
import {
  anchorForDay,
  buildSocialCalendar,
  shiftCalendarAnchor,
  type CalendarMode,
  type CalendarPost,
  type PlacedPost,
} from "./social-calendar";

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${clock} ${suffix}`;
}

export type CalendarEvent = CalendarPost & {
  approval?: string;
  cancelled?: boolean;
  itemId?: string;
  thumbnailSrc?: string;
};

const TONE: Record<ApprovalTone, string> = {
  needs_review: "border-primary bg-primary/10",
  changes: "border-status-late bg-status-late/10",
  scheduled: "border-foreground/40",
  posted: "border-status-complete",
  failed: "border-status-late",
  draft: "border-muted-foreground/40",
};

const MODE_LABEL: Record<CalendarMode, string> = { day: "Day", week: "Week", month: "Month" };

function Chip({
  post,
  selected,
  draggable,
  onSelect,
}: {
  post: PlacedPost & CalendarEvent;
  selected: boolean;
  draggable: boolean;
  onSelect: (id: string) => void;
}) {
  const tone = approvalTone({ state: post.state, approval: post.approval, cancelled: post.cancelled });
  if (!tone) return null;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/post-id", post.id);
        event.dataTransfer.setData("text/post-hour", String(post.hour));
        event.dataTransfer.setData("text/post-minute", String(post.minute));
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSelect(post.id)}
      className={`flex w-full flex-col gap-0.5 rounded-md border border-l-4 px-1.5 py-1 text-left text-xs ${TONE[tone]} ${selected ? "ring-2 ring-ring" : ""}`}
      aria-pressed={selected}
    >
      <span className="flex items-center gap-1">
        {post.thumbnailSrc ? (
          // The picture is served only when this caller can see the space.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-5 rounded object-cover" src={post.thumbnailSrc} onError={(event) => { event.currentTarget.style.display = "none"; }} />
        ) : null}
        <span className="tabular-nums text-muted-foreground">{post.timeLabel}</span>
      </span>
      <span className="truncate font-medium">{post.title}</span>
      <span className="truncate text-muted-foreground">
        {(PLATFORM_LABEL[post.platform] ?? post.platform) || "Post"} · {calendarStatusLabel(post.state)}
      </span>
    </button>
  );
}

function dropTime(event: React.DragEvent, day: string, hourOverride: string | undefined): { id: string; startAt: string } | null {
  const id = event.dataTransfer.getData("text/post-id");
  const hour = hourOverride ?? event.dataTransfer.getData("text/post-hour");
  const minute = event.dataTransfer.getData("text/post-minute");
  if (!id || hour === "" || minute === "") return null;
  return { id, startAt: `${day}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` };
}

/** Day, week, and month for one client's posts, in one time zone. */
export function SocialCalendarView({
  posts,
  timeZone,
  now,
  initialMode,
  selectedId,
  onSelect,
  canReschedule,
  onMove,
}: {
  posts: CalendarEvent[];
  timeZone: string;
  now: number;
  initialMode: CalendarMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canReschedule: boolean;
  onMove?: (postId: string, startAt: string) => void;
}) {
  const [mode, setMode] = React.useState<CalendarMode>(initialMode);
  const [anchor, setAnchor] = React.useState(now);
  const calendar = buildSocialCalendar({ mode, anchor, now, timeZone, posts });
  const acceptDrop = (event: React.DragEvent, day: string, hour?: string) => {
    if (!onMove) return;
    event.preventDefault();
    const move = dropTime(event, day, hour);
    if (move) onMove(move.id, move.startAt);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" aria-label="Previous" onClick={() => setAnchor((current) => shiftCalendarAnchor(current, mode, -1, timeZone))}>
            Prev
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAnchor(now)}>
            Today
          </Button>
          <Button type="button" size="sm" variant="outline" aria-label="Next" onClick={() => setAnchor((current) => shiftCalendarAnchor(current, mode, 1, timeZone))}>
            Next
          </Button>
        </div>
        <p className="text-sm font-medium">{calendar.label}</p>
        <div className="flex gap-1" role="group" aria-label="Calendar view">
          {(["day", "week", "month"] as const).map((choice) => (
            <Button key={choice} type="button" size="sm" variant={mode === choice ? "default" : "outline"} aria-pressed={mode === choice} onClick={() => setMode(choice)}>
              {MODE_LABEL[choice]}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Times shown in {timeZone}.</p>
      {mode === "day" ? (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {calendar.hours.map((hour) => {
            const day = calendar.days[0];
            const rows = day?.posts.filter((post) => post.hour === hour) ?? [];
            return (
              <div
                key={hour}
                className="grid grid-cols-[4.5rem_1fr] gap-2 px-2 py-1"
                onDragOver={(event) => {
                  if (onMove) event.preventDefault();
                }}
                onDrop={(event) => day && acceptDrop(event, day.key, String(hour))}
              >
                <span className="pt-1 text-xs tabular-nums text-muted-foreground">{hourLabel(hour)}</span>
                <div className="flex min-h-8 flex-col gap-1">
                  {rows.map((post) => (
                    <Chip key={post.id} post={post} selected={selectedId === post.id} draggable={canReschedule && post.state === "scheduled"} onSelect={onSelect} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[48rem] grid-cols-7 gap-px bg-border">
            {mode === "month"
              ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
                  <div key={name} className="bg-background px-1.5 py-1 text-xs text-muted-foreground">{name}</div>
                ))
              : null}
            {calendar.days.map((day) => (
              <section
                key={day.key}
                className={`flex min-h-28 flex-col gap-1 bg-background p-1.5 ${day.inMonth ? "" : "opacity-50"} ${day.isToday ? "bg-muted/50" : ""}`}
                onDragOver={(event) => {
                  if (onMove) event.preventDefault();
                }}
                onDrop={(event) => acceptDrop(event, day.key)}
              >
                <button
                  type="button"
                  className="text-left text-xs font-medium"
                  onClick={() => {
                    setMode("day");
                    setAnchor(anchorForDay(day.key, timeZone));
                  }}
                >
                  {mode === "week" ? `${day.weekdayLabel} ${day.dayNumber}` : day.dayNumber}
                </button>
                {mode === "month" && day.posts.length > 3 ? (
                  <>
                    {day.posts.slice(0, 2).map((post) => (
                      <Chip key={post.id} post={post} selected={selectedId === post.id} draggable={canReschedule && post.state === "scheduled"} onSelect={onSelect} />
                    ))}
                    <button
                      type="button"
                      className="text-left text-xs text-muted-foreground underline"
                      onClick={() => {
                        setMode("day");
                        setAnchor(anchorForDay(day.key, timeZone));
                      }}
                    >
                      +{day.posts.length - 2} more
                    </button>
                  </>
                ) : (
                  day.posts.map((post) => (
                    <Chip key={post.id} post={post} selected={selectedId === post.id} draggable={canReschedule && post.state === "scheduled"} onSelect={onSelect} />
                  ))
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
