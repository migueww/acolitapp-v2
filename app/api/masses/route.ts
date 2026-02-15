import dbConnect from "@/lib/db";
import { getMongoose } from "@/lib/mongoose";
import { requireAuth, requireCerimoniario } from "@/lib/auth";
import { MASS_STATUSES, type MassStatus, getMassModel } from "@/models/Mass";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { jsonOk } from "@/src/server/http/response";
import { getRequestId } from "@/src/server/http/request";
import { logError, logInfo } from "@/src/server/http/logging";
import { getUserNameMapByIds } from "@/src/server/users/lookup";
import { isValidActiveMassType, normalizeLiturgyKey } from "@/src/domain/liturgy/service";

export const runtime = "nodejs";

const isValidDate = (value: string): boolean => !Number.isNaN(new Date(value).getTime());
const isMassStatus = (value: unknown): value is MassStatus =>
  typeof value === "string" && MASS_STATUSES.includes(value as MassStatus);

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as {
      name?: string;
      scheduledAt?: string;
      massType?: string;
      chiefBy?: string;
      assignments?: Array<{ roleKey?: unknown; userId?: unknown }>;
    };

    const scheduledAt =
      body.scheduledAt && isValidDate(body.scheduledAt)
        ? new Date(body.scheduledAt)
        : (() => {
            const fallback = new Date();
            fallback.setHours(fallback.getHours() + 1);
            fallback.setSeconds(0);
            fallback.setMilliseconds(0);
            return fallback;
          })();

    const massType = typeof body.massType === "string" ? normalizeLiturgyKey(body.massType) : "";
    if (!massType) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "massType invalido", status: 400 });
    }
    const validMassType = await isValidActiveMassType(massType);
    if (!validMassType) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "massType inexistente ou inativo", status: 400 });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length > 80) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "name deve ter no maximo 80 caracteres", status: 400 });
    }

    const mongoose = getMongoose();
    const createdBy = new mongoose.Types.ObjectId(auth.userId);

    let chiefBy = createdBy;
    if (typeof body.chiefBy === "string") {
      if (!mongoose.Types.ObjectId.isValid(body.chiefBy)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "chiefBy invalido", status: 400 });
      }

      const chiefUser = await getUserModel()
        .findOne({ _id: body.chiefBy, role: "CERIMONIARIO", active: true })
        .select("_id")
        .lean();

      if (!chiefUser) {
        throw new ApiError({
          code: "VALIDATION_ERROR",
          message: "chiefBy deve ser um CERIMONIARIO ativo",
          status: 400,
        });
      }

      chiefBy = new mongoose.Types.ObjectId(body.chiefBy);
    }

    const assignments =
      body.assignments?.map((assignment) => {
        const roleKey = typeof assignment.roleKey === "string" ? assignment.roleKey.trim() : "";
        if (!roleKey) {
          throw new ApiError({ code: "VALIDATION_ERROR", message: "roleKey invalido", status: 400 });
        }

        const userIdRaw = assignment.userId;
        if (userIdRaw === null || userIdRaw === undefined) {
          return { roleKey, userId: null };
        }

        if (typeof userIdRaw !== "string" || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
          throw new ApiError({ code: "VALIDATION_ERROR", message: "userId invalido em assignments", status: 400 });
        }

        return { roleKey, userId: new mongoose.Types.ObjectId(userIdRaw) };
      }) ?? [];

    const mass = await getMassModel().create({
      name,
      scheduledAt,
      massType,
      createdBy,
      chiefBy,
      assignments,
      events: [{ type: "MASS_CREATED", actorId: createdBy, at: new Date() }],
    });

    logInfo(requestId, "Mass created", { massId: mass._id.toString() });

    return jsonOk({ massId: mass._id.toString() }, requestId, { status: 201 });
  } catch (error) {
    logError(requestId, "Erro ao criar missa", error);
    return toHttpResponse(error, requestId);
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    if (auth.role !== "CERIMONIARIO") {
      throw new ApiError({ code: "FORBIDDEN", message: "Acesso negado", status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const page = Number(searchParams.get("page") || "1");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || "20"), 1), 100);

    if (!Number.isInteger(page) || page < 1) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "page invalido", status: 400 });
    }

    const filter: {
      status?: MassStatus;
      scheduledAt?: {
        $gte?: Date;
        $lte?: Date;
      };
    } = {};

    if (statusParam) {
      if (!isMassStatus(statusParam)) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "status invalido", status: 400 });
      }
      filter.status = statusParam;
    }

    if (fromParam || toParam) {
      filter.scheduledAt = {};

      if (fromParam) {
        if (!isValidDate(fromParam)) {
          throw new ApiError({ code: "VALIDATION_ERROR", message: "from invalido", status: 400 });
        }
        filter.scheduledAt.$gte = new Date(fromParam);
      }

      if (toParam) {
        if (!isValidDate(toParam)) {
          throw new ApiError({ code: "VALIDATION_ERROR", message: "to invalido", status: 400 });
        }
        filter.scheduledAt.$lte = new Date(toParam);
      }
    }

    const masses = await getMassModel()
      .find(filter)
      .sort({ scheduledAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("_id name status massType scheduledAt chiefBy createdBy")
      .lean();
    const userNameMap = await getUserNameMapByIds(
      masses.flatMap((mass) => [mass.createdBy, mass.chiefBy])
    );

    return jsonOk(
      {
        items: masses.map((mass) => ({
          id: mass._id.toString(),
          name: mass.name ?? "",
          status: mass.status,
          massType: mass.massType,
          scheduledAt: mass.scheduledAt,
          chiefBy: mass.chiefBy?.toString(),
          createdBy: mass.createdBy?.toString(),
          chiefByName: userNameMap.get(mass.chiefBy?.toString() ?? "") ?? null,
          createdByName: userNameMap.get(mass.createdBy?.toString() ?? "") ?? null,
        })),
        page,
        limit,
      },
      requestId
    );
  } catch (error) {
    logError(requestId, "Erro ao listar missas", error);
    return toHttpResponse(error, requestId);
  }
}


