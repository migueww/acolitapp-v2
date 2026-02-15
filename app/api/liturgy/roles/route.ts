import { requireAuth, requireCerimoniario } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { getLiturgyRoleModel } from "@/models/LiturgyRole";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getNextLiturgyRoleKey, listLiturgyRoles, normalizeLiturgyRoleKey } from "@/src/domain/liturgy/service";

export const runtime = "nodejs";

const parseScore = (value: unknown): number | null => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 1000) return null;
  return rounded;
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const activeParam = searchParams.get("active");
    const activeOnly = activeParam === "true";

    const roles = await listLiturgyRoles({ activeOnly });
    return jsonOk(
      {
        items: roles.map((role) => ({
          key: role.key,
          label: role.label,
          description: role.description ?? "",
          score: typeof role.score === "number" ? role.score : 0,
          active: Boolean(role.active),
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

    const body = (await req.json()) as { label?: unknown; description?: unknown; score?: unknown; active?: unknown };
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const score = parseScore(body.score);
    const active = typeof body.active === "boolean" ? body.active : true;

    if (!label || score === null) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados invalidos para funcao liturgica", status: 400 });
    }

    const key = await getNextLiturgyRoleKey();
    const created = await getLiturgyRoleModel().create({ key, label, description, score, active });
    return jsonOk(
      {
        ok: true,
        item: {
          key: created.key,
          label: created.label,
          description: created.description ?? "",
          score: created.score,
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

    const body = (await req.json()) as { key?: unknown; label?: unknown; description?: unknown; score?: unknown; active?: unknown };
    const key = typeof body.key === "string" ? normalizeLiturgyRoleKey(body.key) : "";
    if (!key) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "key obrigatoria", status: 400 });
    }

    const updates: Record<string, unknown> = {};

    if (body.label !== undefined) {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!label) throw new ApiError({ code: "VALIDATION_ERROR", message: "label invalida", status: 400 });
      updates.label = label;
    }
    if (body.description !== undefined) {
      updates.description = typeof body.description === "string" ? body.description.trim() : "";
    }
    if (body.score !== undefined) {
      const score = parseScore(body.score);
      if (score === null) throw new ApiError({ code: "VALIDATION_ERROR", message: "score invalido", status: 400 });
      updates.score = score;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") throw new ApiError({ code: "VALIDATION_ERROR", message: "active invalido", status: 400 });
      updates.active = body.active;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Nenhuma alteracao enviada", status: 400 });
    }

    const updated = await getLiturgyRoleModel().findOneAndUpdate({ key }, { $set: updates }, { new: true }).lean();
    if (!updated) {
      throw new ApiError({ code: "NOT_FOUND", message: "Funcao liturgica nao encontrada", status: 404 });
    }

    return jsonOk(
      {
        ok: true,
        item: {
          key: updated.key,
          label: updated.label,
          description: updated.description ?? "",
          score: typeof updated.score === "number" ? updated.score : 0,
          active: Boolean(updated.active),
        },
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
