import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";
import { delegateMassAction } from "@/src/domain/mass/actions";
import { serializeMass } from "@/src/domain/mass/serializers";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError, logInfo } from "@/src/server/http/logging";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { newChiefBy?: unknown };
    if (typeof body.newChiefBy !== "string" || !body.newChiefBy.trim()) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "newChiefBy é obrigatório", status: 400 });
    }

    const newChiefBy = body.newChiefBy.trim();
    const mongoose = getMongoose();
    if (!mongoose.Types.ObjectId.isValid(newChiefBy)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "newChiefBy inválido", status: 400 });
    }

    const chiefUser = await getUserModel().findOne({ _id: newChiefBy, role: "CERIMONIARIO", active: true }).select("_id").lean();
    if (!chiefUser) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "newChiefBy deve ser um CERIMONIARIO ativo", status: 400 });
    }

    const { id: massId } = await context.params;
    const mass = await delegateMassAction({ massId, actor, newChiefBy });
    logInfo(requestId, "Mass delegated", { massId });

    return jsonOk({ ok: true, mass: serializeMass(mass) }, requestId);
  } catch (error) {
    logError(requestId, "Erro ao delegar missa", error);
    return toHttpResponse(error, requestId);
  }
}
