import dbConnect from "@/lib/db";
import { getMongoose } from "@/lib/mongoose";
import { requireCerimoniario } from "@/lib/auth";
import { getMassModel } from "@/models/Mass";
import { getUserModel } from "@/models/User";
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
    await requireCerimoniario(req);
    await dbConnect();

    const { id } = await context.params;
    const mongoose = getMongoose();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "id invalido", status: 400 });
    }

    const user = await getUserModel()
      .findById(id)
      .select("_id name username role lastRoleKey active globalScore createdAt updatedAt")
      .lean();
    if (!user) {
      throw new ApiError({ code: "NOT_FOUND", message: "Usuario nao encontrado", status: 404 });
    }

    const masses = await getMassModel()
      .find({ "attendance.confirmed.userId": user._id })
      .sort({ scheduledAt: -1 })
      .limit(100)
      .select("_id status massType scheduledAt chiefBy createdBy assignments attendance.confirmed")
      .lean();

    const userNameMap = await getUserNameMapByIds(masses.flatMap((mass) => [mass.createdBy, mass.chiefBy]));

    const history = masses.map((mass) => {
      const roleAssignment = (mass.assignments ?? []).find((assignment) => assignment.userId?.toString() === user._id.toString());
      const confirmedEntry = (mass.attendance?.confirmed ?? []).find(
        (entry) => entry.userId.toString() === user._id.toString()
      );

      return {
        id: mass._id.toString(),
        status: mass.status,
        massType: mass.massType,
        scheduledAt: mass.scheduledAt,
        chiefBy: mass.chiefBy.toString(),
        chiefByName: userNameMap.get(mass.chiefBy.toString()) ?? null,
        createdBy: mass.createdBy.toString(),
        createdByName: userNameMap.get(mass.createdBy.toString()) ?? null,
        roleKey: roleAssignment?.roleKey ?? "NONE",
        confirmedAt: confirmedEntry?.confirmedAt ?? null,
      };
    });

    return jsonOk(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          role: user.role,
          lastRoleKey: typeof user.lastRoleKey === "string" ? user.lastRoleKey : null,
          active: user.active,
          globalScore: typeof user.globalScore === "number" ? user.globalScore : 50,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        history,
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao buscar perfil especifico", error);
    return toHttpResponse(error, requestId);
  }
}
