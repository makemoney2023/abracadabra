import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminPathForSpaces, decideHost, hqHostName, hqOriginForHost, isHqHost } from "@/lib/host";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const path = request.nextUrl.pathname;
  const decision = decideHost({
    host,
    path,
    hqHost: hqHostName(),
    hqOrigin: hqOriginForHost(host),
  });
  if (decision.kind === "not-found") {
    return new NextResponse("This page is not here.", { status: 404 });
  }
  if (decision.kind === "redirect") {
    return NextResponse.redirect(decision.location);
  }
  if (isHqHost(host)) {
    const internal = adminPathForSpaces(path);
    if (internal) {
      const url = request.nextUrl.clone();
      url.pathname = internal;
      return NextResponse.rewrite(url);
    }
  }
  const response = NextResponse.next();
  if (path === "/view" || path.startsWith("/view/")) {
    response.headers.set("x-robots-tag", "noindex, nofollow");
    response.headers.set("content-security-policy", "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    response.headers.set("x-frame-options", "DENY");
    response.headers.set("referrer-policy", "no-referrer");
    response.headers.set("x-content-type-options", "nosniff");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
