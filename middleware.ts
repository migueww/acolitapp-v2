import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = ["/_next", "/api", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/login"];

const isDevRequest = (req: NextRequest): boolean => {
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  const host = req.headers.get("host") ?? "";
  return host.includes("localhost") || host.includes("127.0.0.1");
};

const applySecurityHeaders = (response: NextResponse, req: NextRequest) => {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");

  if (isDevRequest(req)) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws: wss: http: https:; img-src 'self' data: blob: http: https:; frame-ancestors 'none'; base-uri 'self';"
    );
    return;
  }

  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "media-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; ")
  );
};

export async function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const { pathname } = req.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-request-id", requestId);
    applySecurityHeaders(response, req);
    return response;
  }

  const hasSessionCookie = Boolean(req.cookies.get("session")?.value);
  if (!hasSessionCookie) {
    const response = NextResponse.redirect(new URL("/login", req.url));
    response.headers.set("x-request-id", requestId);
    applySecurityHeaders(response, req);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  applySecurityHeaders(response, req);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
