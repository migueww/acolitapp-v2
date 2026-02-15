import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { autoAssignRolesMassAction } from "@/src/domain/mass/actions";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError, logInfo } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getUserNameMapByIds } from "@/src/server/users/lookup";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const { id: massId } = await context.params;
    const assignments = await autoAssignRolesMassAction({ massId, actor });
    const nameMap = await getUserNameMapByIds(assignments.map((assignment) => assignment.userId));

    logInfo(requestId, "Mass roles auto-assigned", { massId, assignmentsCount: assignments.length });
    return jsonOk(
      {
        ok: true,
        assignments: assignments.map((assignment) => ({
          roleKey: assignment.roleKey,
          userId: assignment.userId ? assignment.userId.toString() : null,
          userName: assignment.userId ? nameMap.get(assignment.userId.toString()) ?? null : null,
        })),
      },
      requestId
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      logError(requestId, "Erro ao autoatribuir funcoes da missa", error);
    }
    return toHttpResponse(error, requestId);
  }
}
