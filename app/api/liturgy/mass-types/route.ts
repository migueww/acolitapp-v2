import { requireAuth, requireCerimoniario } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { getLiturgyMassTypeModel } from "@/models/LiturgyMassType";
import { getLiturgyRoleModel } from "@/models/LiturgyRole";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import {
  getNextLiturgyMassTypeKey,
  listLiturgyMassTypes,
  normalizeLiturgyKey,
  normalizeLiturgyRoleKey,
  normalizeRoleKeyList,
} from "@/src/domain/liturgy/service";

export const runtime = "nodejs";
const MAX_CREATE_ATTEMPTS = 3;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000;

const normalizeRoleKeysInput = async (rawValue: unknown): Promise<string[]> => {
  if (!Array.isArray(rawValue)) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "roleKeys deve ser um array", status: 400 });
  }

  const roleKeys = normalizeRoleKeyList(rawValue.filter((item) => typeof item === "string") as string[]);
  if (roleKeys.length === 0) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "roleKeys nao pode ser vazio", status: 400 });
  }

  const existingCount = await getLiturgyRoleModel().countDocuments({ key: { $in: roleKeys } });
  if (existingCount !== roleKeys.length) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "Uma ou mais funcoes nao existem", status: 400 });
  }

  return roleKeys;
};

const normalizeFallbackRoleKeyInput = async (rawValue: unknown, roleKeys: string[]): Promise<string | null> => {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  if (typeof rawValue !== "string") {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "fallbackRoleKey invalido", status: 400 });
  }
  const fallbackRoleKey = normalizeLiturgyRoleKey(rawValue);
  if (!roleKeys.includes(fallbackRoleKey)) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "fallbackRoleKey deve estar nas funcoes do tipo", status: 400 });
  }
  return fallbackRoleKey;
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const activeParam = searchParams.get("active");
    const activeOnly = activeParam === "true";

    const massTypes = await listLiturgyMassTypes({ activeOnly });
    return jsonOk(
      {
        items: massTypes.map((massType) => ({
          key: massType.key,
          label: massType.label,
          roleKeys: Array.isArray(massType.roleKeys) ? massType.roleKeys : [],
          fallbackRoleKey: typeof massType.fallbackRoleKey === "string" ? massType.fallbackRoleKey : null,
          active: Boolean(massType.active),
        })),
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as { label?: unknown; roleKeys?: unknown; fallbackRoleKey?: unknown; active?: unknown };
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const active = typeof body.active === "boolean" ? body.active : true;
    const roleKeys = await normalizeRoleKeysInput(body.roleKeys);
    const fallbackRoleKey = await normalizeFallbackRoleKeyInput(body.fallbackRoleKey, roleKeys);

    if (!label) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados invalidos para tipo de missa", status: 400 });
    }

    let created: {
      key: string;
      label: string;
      roleKeys: string[];
      fallbackRoleKey: string | null;
      active: boolean;
    } | null = null;
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const key = await getNextLiturgyMassTypeKey();
      try {
        const createdDoc = await getLiturgyMassTypeModel().create({ key, label, roleKeys, fallbackRoleKey, active });
        created = {
          key: createdDoc.key,
          label: createdDoc.label,
          roleKeys: createdDoc.roleKeys,
          fallbackRoleKey: createdDoc.fallbackRoleKey ?? null,
          active: createdDoc.active,
        };
        break;
      } catch (error) {
        if (isDuplicateKeyError(error) && attempt < MAX_CREATE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }
    if (!created) {
      throw new ApiError({ code: "CONFLICT", message: "Nao foi possivel gerar chave unica para tipo de missa", status: 409 });
    }

    return jsonOk(
      {
        ok: true,
        item: {
          key: created.key,
          label: created.label,
          roleKeys: created.roleKeys,
          fallbackRoleKey: created.fallbackRoleKey,
          active: created.active,
        },
      },
      requestId,
      { status: 201 }
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as { key?: unknown; label?: unknown; roleKeys?: unknown; fallbackRoleKey?: unknown; active?: unknown };
    const key = typeof body.key === "string" ? normalizeLiturgyKey(body.key) : "";
    if (!key) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "key obrigatoria", status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label) throw new ApiError({ code: "VALIDATION_ERROR", message: "label invalida", status: 400 });
      updates.label = label;
    }
    if (body.roleKeys !== undefined) {
      const roleKeys = await normalizeRoleKeysInput(body.roleKeys);
      updates.roleKeys = roleKeys;
      const fallbackValue = body.fallbackRoleKey === undefined ? null : body.fallbackRoleKey;
      updates.fallbackRoleKey = await normalizeFallbackRoleKeyInput(fallbackValue, roleKeys);
    } else if (body.fallbackRoleKey !== undefined) {
      const current = await getLiturgyMassTypeModel().findOne({ key }).select("roleKeys").lean();
      if (!current) {
        throw new ApiError({ code: "NOT_FOUND", message: "Tipo de missa nao encontrado", status: 404 });
      }
      updates.fallbackRoleKey = await normalizeFallbackRoleKeyInput(
        body.fallbackRoleKey,
        Array.isArray(current.roleKeys) ? current.roleKeys : []
      );
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new ApiError({ code: "VALIDATION_ERROR", message: "active invalido", status: 400 });
      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Nenhuma alteracao enviada", status: 400 });
    }

    const updated = await getLiturgyMassTypeModel().findOneAndUpdate({ key }, { $set: updates }, { new: true }).lean();
    if (!updated) {
      throw new ApiError({ code: "NOT_FOUND", message: "Tipo de missa nao encontrado", status: 404 });
    }

    return jsonOk(
      {
        ok: true,
        item: {
          key: updated.key,
          label: updated.label,
          roleKeys: Array.isArray(updated.roleKeys) ? updated.roleKeys : [],
          fallbackRoleKey: typeof updated.fallbackRoleKey === "string" ? updated.fallbackRoleKey : null,
          active: Boolean(updated.active),
        },
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
