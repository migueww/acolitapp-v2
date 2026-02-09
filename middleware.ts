import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = ["/_next", "/api", "/favicon.ico", "/login", "/login/signup"];
const SECRET_KEY = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (!SECRET_KEY) {
    console.error("JWT_SECRET não definido");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = req.cookies.get("auth-token");

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const encoder = new TextEncoder();
    await jwtVerify(token.value, encoder.encode(SECRET_KEY));
  } catch (error) {
    console.error("Token inválido:", error);
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}
