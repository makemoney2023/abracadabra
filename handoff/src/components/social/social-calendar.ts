export const CALENDAR_MODES = ["day", "week", "month"] as const;
export type CalendarMode = (typeof CALENDAR_MODES)[number];

export type CalendarPost = {
  id: string;
  title: string;
  platform: string;
  state: string;
  at: number;
};

export type PlacedPost = CalendarPost & {
  timeLabel: string;
  hour: number;
  minute: number;
};

export type CalendarDay = {
  key: string;
  weekdayLabel: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  posts: PlacedPost[];
};

export type SocialCalendar = {
  mode: CalendarMode;
  timeZone: string;
  label: string;
  days: CalendarDay[];
  hours: number[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  key: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(instant: number, timeZone: string): ZonedParts {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return zonedParts(instant, "UTC");
  }
  const bag = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return {
    year,
    month,
    day,
    hour,
    minute: Number(bag.minute),
    weekday: WEEKDAYS.indexOf(String(bag.weekday)),
    key: `${year}-${pad(month)}-${pad(day)}`,
  };
}

/** Wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone, as unix ms. Matches the send form's converter. */
function zonedToUtc(local: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) return null;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number): number => {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
    return asUtc - instant;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

function addDays(key: string, days: number, timeZone: string): string {
  const noon = zonedToUtc(`${key}T12:00`, timeZone);
  if (noon == null) return key;
  return zonedParts(noon + days * 86_400_000, timeZone).key;
}

function daysSinceMonday(key: string, timeZone: string): number {
  const noon = zonedToUtc(`${key}T12:00`, timeZone);
  if (noon == null) return 0;
  const weekday = zonedParts(noon, timeZone).weekday;
  return (weekday + 6) % 7;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function timeLabel(instant: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(instant));
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" }).format(new Date(instant));
  }
}

function rangeLabel(mode: CalendarMode, days: CalendarDay[], timeZone: string): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  const noon = zonedToUtc(`${first.key}T12:00`, timeZone) ?? 0;
  if (mode === "day") {
    return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(noon));
  }
  if (mode === "month") {
    const inMonth = days.find((day) => day.inMonth) ?? first;
    const at = zonedToUtc(`${inMonth.key}T12:00`, timeZone) ?? noon;
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "long", year: "numeric" }).format(new Date(at));
  }
  const end = zonedToUtc(`${last.key}T12:00`, timeZone) ?? noon;
  const sameMonth = first.key.slice(0, 7) === last.key.slice(0, 7);
  const startText = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(new Date(noon));
  const endText = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(end));
  return `${startText} – ${endText}`;
}

function place(posts: CalendarPost[], key: string, timeZone: string): PlacedPost[] {
  return posts
    .filter((post) => zonedParts(post.at, timeZone).key === key)
    .sort((left, right) => left.at - right.at)
    .map((post) => {
      const parts = zonedParts(post.at, timeZone);
      return { ...post, timeLabel: timeLabel(post.at, timeZone), hour: parts.hour, minute: parts.minute };
    });
}

function dayRecord(key: string, timeZone: string, todayKey: string, monthKey: string, posts: CalendarPost[]): CalendarDay {
  const noon = zonedToUtc(`${key}T12:00`, timeZone);
  const parts = noon == null ? zonedParts(0, "UTC") : zonedParts(noon, timeZone);
  return {
    key,
    weekdayLabel: WEEKDAYS[parts.weekday] ?? "",
    dayNumber: parts.day,
    inMonth: key.slice(0, 7) === monthKey,
    isToday: key === todayKey,
    posts: place(posts, key, timeZone),
  };
}

/** One client zone, Monday-start weeks, empty days kept so a gap is visible. */
export function buildSocialCalendar(input: {
  mode: CalendarMode;
  anchor: number;
  now: number;
  timeZone: string;
  posts: CalendarPost[];
}): SocialCalendar {
  const zone = input.timeZone || "UTC";
  const anchor = zonedParts(input.anchor, zone);
  const todayKey = zonedParts(input.now, zone).key;
  const monthKey = `${anchor.year}-${pad(anchor.month)}`;
  let keys: string[] = [];
  if (input.mode === "day") keys = [anchor.key];
  if (input.mode === "week") {
    const start = addDays(anchor.key, -daysSinceMonday(anchor.key, zone), zone);
    keys = Array.from({ length: 7 }, (_, index) => addDays(start, index, zone));
  }
  if (input.mode === "month") {
    const first = `${anchor.year}-${pad(anchor.month)}-01`;
    const start = addDays(first, -daysSinceMonday(first, zone), zone);
    const end = `${anchor.year}-${pad(anchor.month)}-${pad(lastDay(anchor.year, anchor.month))}`;
    const built: string[] = [];
    let key = start;
    while (built.length < 42) {
      built.push(key);
      if (key >= end && built.length % 7 === 0) break;
      key = addDays(key, 1, zone);
    }
    keys = built;
  }
  const days = keys.map((key) => dayRecord(key, zone, todayKey, monthKey, input.posts));
  const postHours = days.flatMap((day) => day.posts.map((post) => post.hour));
  const startHour = postHours.length === 0 ? 8 : Math.min(8, ...postHours);
  const endHour = postHours.length === 0 ? 20 : Math.max(20, ...postHours);
  const hours = input.mode === "day" ? Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index) : [];
  return { mode: input.mode, timeZone: zone, label: rangeLabel(input.mode, days, zone), days, hours };
}

/** Noon on a calendar day in the client zone, so opening that day stays on that date. */
export function anchorForDay(key: string, timeZone: string): number {
  return zonedToUtc(`${key}T12:00`, timeZone || "UTC") ?? Date.parse(`${key}T12:00:00Z`);
}

/** Move the visible range by one day, week, or month. Direction is -1 or 1. */
export function shiftCalendarAnchor(anchor: number, mode: CalendarMode, direction: -1 | 1, timeZone: string): number {
  const zone = timeZone || "UTC";
  const current = zonedParts(anchor, zone);
  if (mode === "month") {
    let month = current.month + direction;
    let year = current.year;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    if (month > 12) {
      month = 1;
      year += 1;
    }
    return zonedToUtc(`${year}-${pad(month)}-01T12:00`, zone) ?? anchor;
  }
  const next = addDays(current.key, direction * (mode === "week" ? 7 : 1), zone);
  return zonedToUtc(`${next}T12:00`, zone) ?? anchor;
}

/** Cadence zone wins while cadence is on. Otherwise the zone most posts were scheduled in. */
export function calendarTimeZone(cadence: { enabled: boolean; timezone: string }, postZones: string[]): string {
  if (cadence.enabled && cadence.timezone) return cadence.timezone;
  const counts = new Map<string, number>();
  for (const zone of postZones) {
    if (!zone) continue;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  let best = "";
  let count = 0;
  for (const [zone, seen] of counts) {
    if (seen > count) {
      best = zone;
      count = seen;
    }
  }
  return best || cadence.timezone || "UTC";
}
