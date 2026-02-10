import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export type UserRole = "CERIMONIARIO" | "ACOLITO";

export type AuthUser = {
  userId: string;
  role: UserRole;
};

const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 2;

const resolveJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error("Defina a variável de ambiente JWT_SECRET no arquivo .env.local");
  }
  return secret;
};

const isRole = (value: unknown): value is UserRole =>
  value === "CERIMONIARIO" || value === "ACOLITO";

const getTokenFromRequest = (request: Request): string | null => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  const sessionCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  return decodeURIComponent(sessionCookie.split("=").slice(1).join("="));
};

const verifyToken = async (token: string): Promise<AuthUser | null> => {
  try {
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(resolveJwtSecret()));
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    const role = payload.role;

    if (!userId || !isRole(role)) {
      return null;
    }

    return { userId, role };
  } catch {
    return null;
  }
};

export async function getAuth(request?: Request): Promise<AuthUser | null> {
  if (request) {
    const requestToken = getTokenFromRequest(request);
    if (!requestToken) {
      return null;
    }

    return verifyToken(requestToken);
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  return verifyToken(sessionToken);
}

export async function requireAuth(request: Request): Promise<AuthUser> {
  const auth = await getAuth(request);

  if (!auth) {
    throw new Error("Não autorizado");
  }

  return auth;
}

export async function requireCerimoniario(request: Request): Promise<AuthUser> {
  const auth = await requireAuth(request);

  if (auth.role !== "CERIMONIARIO") {
    throw new Error("Acesso negado");
  }

  return auth;
}

export async function createSessionToken(payload: AuthUser): Promise<string> {
  const encoder = new TextEncoder();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(encoder.encode(resolveJwtSecret()));
}

export const sessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  maxAge: SESSION_DURATION_SECONDS,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export { resolveJwtSecret, SESSION_COOKIE_NAME };
