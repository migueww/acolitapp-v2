import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMassModel } from "@/models/Mass";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { toHttpResponse } from "@/src/server/http/errors";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

const pickByPriority = <T extends { status: string }>(items: T[], priority: string[]): T | null => {
  for (const status of priority) {
    const found = items.find((item) => item.status === status);
    if (found) return found;
  }
  return null;
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const query =
      auth.role === "CERIMONIARIO"
        ? {
            status: { $in: ["SCHEDULED", "OPEN", "PREPARATION"] },
          }
        : {
            status: { $in: ["OPEN", "SCHEDULED"] },
          };

    const masses = await getMassModel()
      .find(query)
      .sort({ scheduledAt: 1 })
      .select("_id status massType scheduledAt chiefBy createdBy")
      .limit(50)
      .lean();

    const picked =
      auth.role === "CERIMONIARIO"
        ? pickByPriority(masses, ["OPEN", "PREPARATION", "SCHEDULED"])
        : pickByPriority(masses, ["OPEN", "SCHEDULED"]);

    if (!picked) {
      return jsonOk({ item: null }, requestId);
    }

    return jsonOk(
      {
        item: {
          id: picked._id.toString(),
          status: picked.status,
          massType: picked.massType,
          scheduledAt: picked.scheduledAt,
          chiefBy: picked.chiefBy.toString(),
          createdBy: picked.createdBy.toString(),
        },
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao buscar próxima missa", error);
    return toHttpResponse(error, requestId);
  }
}
