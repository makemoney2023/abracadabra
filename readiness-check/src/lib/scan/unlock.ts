import { z } from "zod";

export const unlockEmailSchema = z.object({
  email: z.email(),
});

export function unlockCookieName(token: string): string {
  return `scan_unlock_${token}`;
}

/** An ops scan is the staff report. A public scan stays closed until the email gate. */
export function scanReportOpen(source: string, cookie: string | undefined): boolean {
  return source === "ops" || cookie === "1";
}

export function hasUnlockCookie(
  token: string,
  getCookie: (name: string) => string | undefined,
): boolean {
  return getCookie(unlockCookieName(token)) === "1";
}
