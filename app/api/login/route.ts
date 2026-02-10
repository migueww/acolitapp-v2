import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getClientIp, getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { assertLoginRateLimit } from "@/src/server/security/rate-limit";
import { logError, logInfo } from "@/src/server/http/logging";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    assertLoginRateLimit(getClientIp(req));

    const body = (await req.json()) as { username?: string; email?: string; password?: string };
    const usernameValue =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!usernameValue || !password) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados inválidos", status: 400 });
    }

    await dbConnect();

    const user = await getUserModel().findOne({ username: usernameValue }).select("_id passwordHash role active").lean();

    if (!user || !user.active) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Usuário ou senha incorretos", status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Usuário ou senha incorretos", status: 401 });
    }

    const token = await createSessionToken({ userId: user._id.toString(), role: user.role });

    const response = jsonOk({ ok: true }, requestId);
    response.cookies.set(sessionCookieOptions.name, token, {
      httpOnly: sessionCookieOptions.httpOnly,
      maxAge: sessionCookieOptions.maxAge,
      path: sessionCookieOptions.path,
      sameSite: sessionCookieOptions.sameSite,
      secure: sessionCookieOptions.secure,
    });

    logInfo(requestId, "User logged in", { userId: user._id.toString(), role: user.role });
    return response;
  } catch (error) {
    logError(requestId, "Erro no login", error);
    return toHttpResponse(error, requestId);
  }
}
