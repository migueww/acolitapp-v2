import { jwtVerify } from "jose";

export type AuthUser = {
  id: string;
  role: "CERIMONIARIO" | "ACOLITO";
};

const resolveJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error("Defina a variável de ambiente JWT_SECRET no arquivo .env.local");
  }
  return secret;
};

export async function requireAuth(request: Request): Promise<AuthUser> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Token ausente");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    throw new Error("Token ausente");
  }

  const encoder = new TextEncoder();
  const { payload } = await jwtVerify(token, encoder.encode(resolveJwtSecret()));

  const userId = typeof payload.userId === "string" ? payload.userId : null;
  const role = typeof payload.role === "string" ? payload.role : null;

  if (!userId || (role !== "CERIMONIARIO" && role !== "ACOLITO")) {
    throw new Error("Token inválido");
  }

  return { id: userId, role };
}

export { resolveJwtSecret };
