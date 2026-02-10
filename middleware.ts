import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth";

const PUBLIC_PATH_PREFIXES = ["/_next", "/api", "/favicon.ico", "/login"];

const applySecurityHeaders = (response: NextResponse) => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'self';");
};

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const { pathname } = req.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    applySecurityHeaders(response);
    return response;
  }

  const auth = await getAuth(req);

  if (!auth) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.headers.set("x-request-id", requestId);
    applySecurityHeaders(response);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  applySecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
