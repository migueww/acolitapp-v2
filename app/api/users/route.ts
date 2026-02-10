import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { requireAuth, requireCerimoniario } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

const isValidRole = (role: unknown): role is UserRole => role === "CERIMONIARIO" || role === "ACOLITO";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const activeParam = searchParams.get("active");

    const filter: { role?: UserRole; active?: boolean } = {};

    if (role) {
      if (!isValidRole(role)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "role inválido", status: 400 });
      }
      filter.role = role;
    }

    if (activeParam !== null) {
      if (activeParam !== "true" && activeParam !== "false") {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "active inválido", status: 400 });
      }
      filter.active = activeParam === "true";
    }

    const users = await getUserModel().find(filter).sort({ name: 1 }).select("_id name role active").lean();

    return jsonOk(
      {
        items: users.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          role: user.role,
          active: user.active,
        })),
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao listar usuários", error);
    return toHttpResponse(error, requestId);
  }
}

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
