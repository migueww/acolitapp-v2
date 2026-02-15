import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { getMongoose } from "@/lib/mongoose";
import { getMassModel } from "@/models/Mass";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getUserNameMapByIds } from "@/src/server/users/lookup";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const { id } = await context.params;
    const mongoose = getMongoose();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "id invalido", status: 400 });
    }

    const mass = await getMassModel().findById(id).lean();
    if (!mass) {
      throw new ApiError({ code: "NOT_FOUND", message: "Missa nao encontrada", status: 404 });
    }

    const joinedEntries = mass.attendance?.joined ?? [];
    const confirmedEntries = mass.attendance?.confirmed ?? [];
    const pendingEntries = mass.attendance?.pending ?? [];
    const assignments = mass.assignments ?? [];
    const events = auth.role === "CERIMONIARIO" ? mass.events ?? [] : [];

    const userNameMap = await getUserNameMapByIds([
      mass.createdBy,
      mass.chiefBy,
      ...joinedEntries.map((entry) => entry.userId),
      ...confirmedEntries.map((entry) => entry.userId),
      ...pendingEntries.map((entry) => entry.userId),
      ...assignments.map((assignment) => assignment.userId),
      ...events.map((event) => event.actorId),
    ]);

    return jsonOk(
      {
        id: mass._id.toString(),
        name: mass.name ?? "",
        status: mass.status,
        massType: mass.massType,
        scheduledAt: mass.scheduledAt,
        createdBy: mass.createdBy.toString(),
        chiefBy: mass.chiefBy.toString(),
        createdByName: userNameMap.get(mass.createdBy.toString()) ?? null,
        chiefByName: userNameMap.get(mass.chiefBy.toString()) ?? null,
        openedAt: mass.openedAt ?? null,
        preparationAt: mass.preparationAt ?? null,
        finishedAt: mass.finishedAt ?? null,
        canceledAt: mass.canceledAt ?? null,
        attendance: {
          joined: joinedEntries.map((entry) => ({
            userId: entry.userId.toString(),
            userName: userNameMap.get(entry.userId.toString()) ?? null,
            joinedAt: entry.joinedAt,
          })),
          confirmed: confirmedEntries.map((entry) => ({
            userId: entry.userId.toString(),
            userName: userNameMap.get(entry.userId.toString()) ?? null,
            confirmedAt: entry.confirmedAt,
          })),
          pending: pendingEntries.map((entry) => ({
            requestId: entry.requestId,
            userId: entry.userId.toString(),
            userName: userNameMap.get(entry.userId.toString()) ?? null,
            requestedAt: entry.requestedAt,
          })),
        },
        assignments: assignments.map((assignment) => ({
          roleKey: assignment.roleKey,
          userId: assignment.userId ? assignment.userId.toString() : null,
          userName: assignment.userId ? userNameMap.get(assignment.userId.toString()) ?? null : null,
        })),
        events: events.map((event) => ({
          type: event.type,
          actorId: event.actorId.toString(),
          actorName: userNameMap.get(event.actorId.toString()) ?? null,
          at: event.at,
          payload: event.payload ?? null,
        })),
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
