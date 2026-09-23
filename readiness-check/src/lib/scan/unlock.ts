import { z } from "zod";

export const unlockEmailSchema = z.object({
  email: z.email(),
});

export function unlockCookieName(token: string): string {
  return `scan_unlock_${token}`;
}

export function hasUnlockCookie(
  token: string,
  getCookie: (name: string) => string | undefined,
): boolean {
  return getCookie(unlockCookieName(token)) === "1";
}
