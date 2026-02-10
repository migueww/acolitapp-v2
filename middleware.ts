import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getAuth } from "@/lib/auth";

const PUBLIC_PATH_PREFIXES = ["/_next", "/api", "/favicon.ico", "/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const auth = await getAuth(req);

  if (!auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
