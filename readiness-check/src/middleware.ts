import { NextResponse, type NextRequest } from "next/server";
import { OPS_COOKIE, verifyOpsCookie } from "@/lib/ops/session";

function isCheckHost(request: NextRequest): boolean {
  const raw = process.env.NEXT_PUBLIC_CHECK_URL;
  if (!raw) return false;
  try {
    return request.headers.get("host") === new URL(raw).host;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/" && isCheckHost(request)) {
    return NextResponse.redirect(new URL("/check", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const isOps = path.startsWith("/ops");
  const isLogin = path === "/ops/login" || path.startsWith("/ops/login/");
  if (isOps && !isLogin) {
    const password = process.env.CHECK_OPS_PASSWORD ?? "";
    const token = request.cookies.get(OPS_COOKIE)?.value;
    const valid = await verifyOpsCookie(token, password);
    if (!valid) {
      const loginUrl = new URL("/ops/login", request.url);
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/", "/ops/:path*"],
};
