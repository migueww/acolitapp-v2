import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";
import { assignRolesMassAction } from "@/src/domain/mass/actions";
import { serializeMass } from "@/src/domain/mass/serializers";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError, logInfo } from "@/src/server/http/logging";

export const runtime = "nodejs";

type InputAssignment = {
  roleKey?: unknown;
  userId?: unknown;
};

const normalizeAssignments = async (rawAssignments: unknown) => {
  if (!Array.isArray(rawAssignments)) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "assignments deve ser um array", status: 400 });
  }

  const mongoose = getMongoose();

  const assignments = rawAssignments.map((assignmentRaw) => {
    const assignment = assignmentRaw as InputAssignment;

    const roleKey = typeof assignment.roleKey === "string" ? assignment.roleKey.trim().toUpperCase() : "";
    if (!roleKey) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "roleKey inválido em assignments", status: 400 });
    }

    const userIdRaw = assignment.userId;
    if (userIdRaw === null || userIdRaw === undefined) {
      return { roleKey, userId: null };
    }

    if (typeof userIdRaw !== "string" || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "userId inválido em assignments", status: 400 });
    }

    return { roleKey, userId: new mongoose.Types.ObjectId(userIdRaw) };
  });

  const userIds = assignments
    .filter((assignment) => assignment.userId !== null)
    .map((assignment) => assignment.userId!.toString());

  if (userIds.length > 0) {
    const uniqueIds = Array.from(new Set(userIds));
    const validUsersCount = await getUserModel().countDocuments({
      _id: { $in: uniqueIds },
      role: "ACOLITO",
      active: true,
    });

    if (validUsersCount !== uniqueIds.length) {
      throw new ApiError({
        code: "VALIDATION_ERROR",
        message: "Todos os userId em assignments devem ser ACOLITO ativo",
        status: 400,
      });
    }
  }

  return assignments;
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { assignments?: unknown };
    const assignments = await normalizeAssignments(body.assignments);

    const { id: massId } = await context.params;
    const mass = await assignRolesMassAction({ massId, actor, assignments });
    logInfo(requestId, "Mass assignments updated", { massId, assignmentsCount: assignments.length });

    return jsonOk({ ok: true, mass: serializeMass(mass) }, requestId);
  } catch (error) {
    logError(requestId, "Erro ao atribuir funções da missa", error);
    return toHttpResponse(error, requestId);
  }
}
