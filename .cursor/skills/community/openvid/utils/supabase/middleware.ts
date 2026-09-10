import { createServerClient } from "@supabase/ssr";
import { type User } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export type SessionUpdateResult = {
  user: User | null;
  applyAuthCookies: (target: NextResponse) => boolean;
};

function isVideoEditorPath(pathname: string, searchParams: URLSearchParams) {
  return pathname.endsWith("/editor") && searchParams.get("mode") !== "photo";
}

function isLoginPath(pathname: string) {
  return pathname.endsWith("/login");
}

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.includes("-auth-token"));
}

export function shouldRefreshSession(request: NextRequest): boolean {
  const { pathname, searchParams } = request.nextUrl;
  if (isVideoEditorPath(pathname, searchParams) || isLoginPath(pathname)) {
    return true;
  }
  return hasSupabaseAuthCookie(request);
}

export function getSafeInternalPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return fallback;
  }
  return value;
}

export async function updateSession(
  request: NextRequest,
): Promise<SessionUpdateResult> {
  const cookiesToApply: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        cookiesToApply.length = 0;
        cookiesToSet.forEach(({ name, value, options }) => {
          cookiesToApply.push({ name, value, options });
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error?.code === "refresh_token_not_found" || error?.code === "session_not_found") {
    await supabase.auth.signOut({ scope: "local" });
    const authCookieNames = request.cookies
      .getAll()
      .filter((c) => c.name.includes("-auth-token"))
      .map((c) => c.name);

    const applyAuthCookies = (target: NextResponse): boolean => {
      authCookieNames.forEach((name) => {
        target.cookies.delete(name);
      });
      return authCookieNames.length > 0;
    };

    return { user: null, applyAuthCookies };
  }

  const applyAuthCookies = (target: NextResponse): boolean => {
    if (cookiesToApply.length === 0) return false;

    cookiesToApply.forEach(({ name, value, options }) => {
      target.cookies.set(name, value, options);
    });
    return true;
  };

  return { user, applyAuthCookies };
}

export function enforceAuthRoutes(
  request: NextRequest,
  user: User | null,
): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const { searchParams } = request.nextUrl;


  if (user && isLoginPath(pathname)) {
    const fallback = pathname.replace(/\/login$/, "/editor");
    const destination = getSafeInternalPath(
      searchParams.get("redirectedFrom"),
      fallback,
    );

    const url = request.nextUrl.clone();
    const destUrl = new URL(destination, request.nextUrl.origin);
    url.pathname = destUrl.pathname;
    url.search = destUrl.search;

    return NextResponse.redirect(url);
  }

  return null;
}
