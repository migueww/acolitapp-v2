import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MASS_STATUSES, type MassStatus, getMassModel } from "@/models/Mass";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { logError } from "@/src/server/http/logging";

export const runtime = "nodejs";

const isMassStatus = (value: unknown): value is MassStatus =>
  typeof value === "string" && MASS_STATUSES.includes(value as MassStatus);

const parseDate = (value: string | null, field: string): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError({ code: "VALIDATION_ERROR", message: `${field} inválido`, status: 400 });
  }
  return date;
};

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const from = parseDate(searchParams.get("from"), "from");
    const to = parseDate(searchParams.get("to"), "to");

    const page = Number(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "20"), 1), 100);

    if (!Number.isInteger(page) || page < 1) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "page inválido", status: 400 });
    }

    const filter: Record<string, unknown> = {};
    if (status) {
      if (!isMassStatus(status)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "status inválido", status: 400 });
      }
      filter.status = status;
    }

    if (from || to) {
      filter.scheduledAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    if (auth.role === "CERIMONIARIO") {
      filter.$or = [{ createdBy: auth.userId }, { chiefBy: auth.userId }];
    } else {
      filter["attendance.confirmed.userId"] = auth.userId;
    }

    const skip = (page - 1) * limit;

    const masses = await getMassModel()
      .find(filter)
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(limit)
      .select("_id status massType scheduledAt chiefBy createdBy")
      .lean();

    return jsonOk(
      {
        items: masses.map((mass) => ({
          id: mass._id.toString(),
          status: mass.status,
          massType: mass.massType,
          scheduledAt: mass.scheduledAt,
          chiefBy: mass.chiefBy.toString(),
          createdBy: mass.createdBy.toString(),
        })),
        page,
        limit,
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao listar missas do usuário", error);
    return toHttpResponse(error, requestId);
  }
}
