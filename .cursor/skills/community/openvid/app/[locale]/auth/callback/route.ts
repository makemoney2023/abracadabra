import { createClient } from "@/utils/supabase/server";
import { defaultLocale, locales, type Locale } from "@/i18n";
import { NextResponse } from "next/server";

function resolveLocale(requestUrl: URL, request: Request): Locale {
  const segments = requestUrl.pathname.split("/").filter(Boolean);
  const fromPath = segments[0];
  if (fromPath && locales.includes(fromPath as Locale)) {
    return fromPath as Locale;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const localeCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("NEXT_LOCALE="));
  const fromCookie = localeCookie?.split("=")[1];
  if (fromCookie && locales.includes(fromCookie as Locale)) {
    return fromCookie as Locale;
  }

  return defaultLocale;
}

function getSafeNextPath(next: string | null, locale: Locale): string {
  const fallback = `/${locale}/editor`;
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
    return fallback;
  }
  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const locale = resolveLocale(requestUrl, request);

  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const origin = host ? `${protocol}://${host}` : requestUrl.origin;

  const nextPath = getSafeNextPath(
    requestUrl.searchParams.get("next"),
    locale,
  );

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Error exchanging code for session:", error);
      return NextResponse.redirect(
        `${origin}/${locale}/login?error=auth_failed`,
      );
    }

    return NextResponse.redirect(`${origin}${nextPath}`);
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_missing_code`);
}
