import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { requireCerimoniario } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

const isValidRole = (role: unknown): role is UserRole => role === "CERIMONIARIO" || role === "ACOLITO";

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as {
      name?: string;
      username?: string;
      password?: string;
      role?: UserRole;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;

    if (!name || !username || !password || !isValidRole(role)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados inválidos", status: 400 });
    }

    const existingUser = await getUserModel().exists({ username });
    if (existingUser) {
      throw new ApiError({ code: "CONFLICT", message: "Username já em uso", status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await getUserModel().create({
      name,
      username,
      passwordHash,
      role,
      active: true,
    });

    return jsonOk(
      {
        ok: true,
        user: {
          id: createdUser._id.toString(),
          name: createdUser.name,
          username: createdUser.username,
          role: createdUser.role,
          active: createdUser.active,
        },
      },
      requestId,
      { status: 201 }
    );
  } catch (error) {
    logError(requestId, "Erro ao criar usuário", error);
    return toHttpResponse(error, requestId);
  }
}
