import { parseJson } from "@/app/api/masses/[id]/_action-helpers";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { previewMassConfirmationAction } from "@/src/domain/mass/actions";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError, logInfo } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getUserNameMapByIds } from "@/src/server/users/lookup";

export const runtime = "nodejs";

type ScanBody = {
  qrPayload?: unknown;
};

type QrBody = {
  type?: string;
  massId?: string;
  requestId?: string;
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = await parseJson<ScanBody>(req);
    const rawPayload = typeof body.qrPayload === "string" ? body.qrPayload : "";
    if (!rawPayload) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "qrPayload obrigatÃ³rio", status: 400 });
    }

    let parsed: QrBody;
    try {
      parsed = JSON.parse(rawPayload) as QrBody;
    } catch {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "QR invÃ¡lido", status: 400 });
    }

    if (parsed.type !== "MASS_CONFIRMATION" || typeof parsed.requestId !== "string" || typeof parsed.massId !== "string") {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "QR invÃ¡lido", status: 400 });
    }

    const { id: massId } = await context.params;
    if (parsed.massId !== massId) {
      throw new ApiError({ code: "CONFLICT", message: "QR nÃ£o pertence a esta missa", status: 409 });
    }

    const preview = await previewMassConfirmationAction({ massId, actor, requestId: parsed.requestId });
    const nameMap = await getUserNameMapByIds([preview.pendingUserId, preview.mass.chiefBy, preview.mass.createdBy]);

    logInfo(requestId, "Mass confirmation scanned", { massId, actorRole: actor.role });
    return jsonOk(
      {
        ok: true,
        requestId: parsed.requestId,
        acolito: {
          userId: preview.pendingUserId,
          name: nameMap.get(preview.pendingUserId) ?? null,
        },
        mass: {
          id: preview.mass._id.toString(),
          scheduledAt: preview.mass.scheduledAt,
          massType: preview.mass.massType,
          chiefByName: nameMap.get(preview.mass.chiefBy.toString()) ?? null,
          createdByName: nameMap.get(preview.mass.createdBy.toString()) ?? null,
        },
      },
      requestId
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      logError(requestId, "Erro ao ler QR de confirmaÃ§Ã£o", error);
    }
    return toHttpResponse(error, requestId);
  }
}
