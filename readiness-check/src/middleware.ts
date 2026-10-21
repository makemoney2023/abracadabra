import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { homeRedirectPath } from "@/lib/hosts";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const redirectTo = homeRedirectPath(request.headers.get("host"), path);
  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: { headers: requestHeaders },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh session for ops routes (and keep cookies in sync).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOps = path.startsWith("/ops");
  const isLogin = path === "/ops/login";

  if (isOps && !isLogin && !user) {
    const loginUrl = new URL("/ops/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/", "/ops/:path*"],
};
