import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { getMongoose } from "@/lib/mongoose";
import { requireAuth, requireCerimoniario } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { getLiturgyRoleModel } from "@/models/LiturgyRole";
import { normalizeLiturgyRoleKey } from "@/src/domain/liturgy/service";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

const isValidRole = (role: unknown): role is UserRole => role === "CERIMONIARIO" || role === "ACOLITO";

const parseGlobalScore = (value: unknown): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  const normalized = Math.round(value);
  if (normalized < 0 || normalized > 100) {
    return null;
  }

  return normalized;
};

const parseLastRoleKey = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "lastRoleKey invalido", status: 400 });
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return normalizeLiturgyRoleKey(trimmed);
};

const assertActiveRoleKey = async (roleKey: string): Promise<void> => {
  const exists = await getLiturgyRoleModel().exists({ key: roleKey, active: true });
  if (!exists) {
    throw new ApiError({
      code: "VALIDATION_ERROR",
      message: "lastRoleKey deve referenciar uma funcao liturgica ativa",
      status: 400,
    });
  }
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const activeParam = searchParams.get("active");
    const query = searchParams.get("q");

    const filter: {
      role?: UserRole;
      active?: boolean;
      $or?: Array<{ name?: { $regex: string; $options: string }; username?: { $regex: string; $options: string } }>;
    } = {};

    if (role) {
      if (!isValidRole(role)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "role invalido", status: 400 });
      }
      filter.role = role;
    }

    if (activeParam !== null) {
      if (activeParam !== "true" && activeParam !== "false") {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "active invalido", status: 400 });
      }
      filter.active = activeParam === "true";
    }

    const normalizedQuery = typeof query === "string" ? query.trim() : "";
    if (normalizedQuery) {
      filter.$or = [
        { name: { $regex: normalizedQuery, $options: "i" } },
        { username: { $regex: normalizedQuery, $options: "i" } },
      ];
    }

    const users = await getUserModel()
      .find(filter)
      .sort({ name: 1 })
      .select("_id name username role lastRoleKey active globalScore")
      .lean();

    return jsonOk(
      {
        items: users.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          role: user.role,
          lastRoleKey: typeof user.lastRoleKey === "string" ? user.lastRoleKey : null,
          active: user.active,
          globalScore: typeof user.globalScore === "number" ? user.globalScore : 50,
        })),
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao listar usuarios", error);
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
      globalScore?: number;
      lastRoleKey?: string | null;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;
    const globalScore = parseGlobalScore(body.globalScore ?? 50);
    const rawLastRoleKey = parseLastRoleKey(body.lastRoleKey);

    if (!name || !username || !password || !isValidRole(role) || globalScore === null) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados invalidos", status: 400 });
    }
    if (password.length < 6) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Senha deve ter ao menos 6 caracteres", status: 400 });
    }

    const existingUser = await getUserModel().exists({ username });
    if (existingUser) {
      throw new ApiError({ code: "CONFLICT", message: "Username/email ja em uso", status: 409 });
    }

    let lastRoleKey: string | null = null;
    if (role === "ACOLITO") {
      lastRoleKey = rawLastRoleKey;
      if (lastRoleKey) {
        await assertActiveRoleKey(lastRoleKey);
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await getUserModel().create({
      name,
      username,
      passwordHash,
      role,
      lastRoleKey,
      active: true,
      globalScore,
    });

    return jsonOk(
      {
        ok: true,
        user: {
          id: createdUser._id.toString(),
          name: createdUser.name,
          username: createdUser.username,
          role: createdUser.role,
          lastRoleKey: typeof createdUser.lastRoleKey === "string" ? createdUser.lastRoleKey : null,
          active: createdUser.active,
          globalScore: createdUser.globalScore,
        },
      },
      requestId,
      { status: 201 }
    );
  } catch (error) {
    logError(requestId, "Erro ao criar usuario", error);
    return toHttpResponse(error, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as {
      id?: string;
      name?: string;
      username?: string;
      role?: UserRole;
      active?: boolean;
      globalScore?: number;
      password?: string;
      lastRoleKey?: string | null;
    };

    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "id obrigatorio", status: 400 });
    }

    const mongoose = getMongoose();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "id invalido", status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "name invalido", status: 400 });
      }
      updates.name = name;
    }

    if (body.username !== undefined) {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!username) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "username invalido", status: 400 });
      }

      const conflict = await getUserModel().exists({ _id: { $ne: id }, username });
      if (conflict) {
        throw new ApiError({ code: "CONFLICT", message: "Username/email ja em uso", status: 409 });
      }

      updates.username = username;
    }

    const existingUser = await getUserModel().findById(id).select("_id role").lean();
    if (!existingUser) {
      throw new ApiError({ code: "NOT_FOUND", message: "Usuario nao encontrado", status: 404 });
    }

    const effectiveRole = body.role ?? existingUser.role;

    if (body.role !== undefined) {
      if (!isValidRole(body.role)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "role invalido", status: 400 });
      }
      updates.role = body.role;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "active invalido", status: 400 });
      }
      updates.active = body.active;
    }

    if (body.globalScore !== undefined) {
      const globalScore = parseGlobalScore(body.globalScore);
      if (globalScore === null) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "globalScore invalido", status: 400 });
      }
      updates.globalScore = globalScore;
    }

    if (body.password !== undefined) {
      const password = typeof body.password === "string" ? body.password : "";
      if (!password) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "password invalido", status: 400 });
      }
      if (password.length < 6) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "Senha deve ter ao menos 6 caracteres", status: 400 });
      }
      updates.passwordHash = await bcrypt.hash(password, 10);
    }

    if (body.lastRoleKey !== undefined) {
      const parsedLastRoleKey = parseLastRoleKey(body.lastRoleKey);
      if (effectiveRole === "CERIMONIARIO") {
        updates.lastRoleKey = null;
      } else {
        if (parsedLastRoleKey) {
          await assertActiveRoleKey(parsedLastRoleKey);
        }
        updates.lastRoleKey = parsedLastRoleKey;
      }
    } else if (effectiveRole === "CERIMONIARIO") {
      updates.lastRoleKey = null;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Nenhuma alteracao enviada", status: 400 });
    }

    const updatedUser = await getUserModel()
      .findByIdAndUpdate(id, { $set: updates }, { new: true })
      .select("_id name username role lastRoleKey active globalScore")
      .lean();

    if (!updatedUser) {
      throw new ApiError({ code: "NOT_FOUND", message: "Usuario nao encontrado", status: 404 });
    }

    return jsonOk(
      {
        ok: true,
        user: {
          id: updatedUser._id.toString(),
          name: updatedUser.name,
          username: updatedUser.username,
          role: updatedUser.role,
          lastRoleKey: typeof updatedUser.lastRoleKey === "string" ? updatedUser.lastRoleKey : null,
          active: updatedUser.active,
          globalScore: typeof updatedUser.globalScore === "number" ? updatedUser.globalScore : 50,
        },
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao atualizar usuario", error);
    return toHttpResponse(error, requestId);
  }
}
