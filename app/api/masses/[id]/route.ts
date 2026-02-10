import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMassModel } from "@/models/Mass";
import { getMongoose } from "@/lib/mongoose";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { jsonOk } from "@/src/server/http/response";
import { getRequestId } from "@/src/server/http/request";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const { id } = await context.params;
    const mongoose = getMongoose();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "id inválido", status: 400 });
    }

    const mass = await getMassModel().findById(id).lean();
    if (!mass) {
      throw new ApiError({ code: "NOT_FOUND", message: "Missa não encontrada", status: 404 });
    }

    return jsonOk(
      {
        id: mass._id.toString(),
        status: mass.status,
        massType: mass.massType,
        scheduledAt: mass.scheduledAt,
        createdBy: mass.createdBy.toString(),
        chiefBy: mass.chiefBy.toString(),
        openedAt: mass.openedAt ?? null,
        preparationAt: mass.preparationAt ?? null,
        finishedAt: mass.finishedAt ?? null,
        canceledAt: mass.canceledAt ?? null,
        attendance: {
          joined:
            mass.attendance?.joined?.map((entry) => ({
              userId: entry.userId.toString(),
              joinedAt: entry.joinedAt,
            })) ?? [],
          confirmed:
            mass.attendance?.confirmed?.map((entry) => ({
              userId: entry.userId.toString(),
              confirmedAt: entry.confirmedAt,
            })) ?? [],
        },
        assignments:
          mass.assignments?.map((assignment) => ({
            roleKey: assignment.roleKey,
            userId: assignment.userId ? assignment.userId.toString() : null,
          })) ?? [],
        events:
          mass.events?.map((event) => ({
            type: event.type,
            actorId: event.actorId.toString(),
            at: event.at,
            payload: event.payload ?? null,
          })) ?? [],
        createdAt: mass.createdAt,
        updatedAt: mass.updatedAt,
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao detalhar missa", error);
    return toHttpResponse(error, requestId);
  }
}
