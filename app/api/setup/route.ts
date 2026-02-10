import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    const setupToken = req.headers.get("x-setup-token");
    const expectedToken = process.env.SETUP_TOKEN;

    if (!expectedToken || setupToken !== expectedToken) {
      throw new ApiError({ code: "FORBIDDEN", message: "Setup token inválido", status: 403 });
    }

    await dbConnect();

    const existingCerimoniario = await getUserModel().exists({ role: "CERIMONIARIO" });
    if (existingCerimoniario) {
      throw new ApiError({
        code: "CONFLICT",
        message: "Bootstrap já concluído. CERIMONIARIO já existe.",
        status: 409,
      });
    }

    const body = (await req.json()) as { name?: string; username?: string; password?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !username || !password) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados inválidos", status: 400 });
    }

    const existingUsername = await getUserModel().exists({ username });
    if (existingUsername) {
      throw new ApiError({ code: "CONFLICT", message: "Username já em uso", status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await getUserModel().create({
      name,
      username,
      passwordHash,
      role: "CERIMONIARIO",
      active: true,
    });

    return jsonOk({ ok: true, message: "CERIMONIARIO inicial criado com sucesso" }, requestId);
  } catch (error) {
    logError(requestId, "Erro no setup", error);
    return toHttpResponse(error, requestId);
  }
}
