import { parseJson } from "@/app/api/masses/[id]/_action-helpers";
import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { confirmMassAction } from "@/src/domain/mass/actions";
import { serializeMass } from "@/src/domain/mass/serializers";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError, logInfo } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

type ConfirmBody = {
  requestId?: unknown;
  decision?: unknown;
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = await parseJson<ConfirmBody>(req);
    const requestToReview = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const decision = body.decision === "confirm" || body.decision === "deny" ? body.decision : null;
    if (!requestToReview || !decision) {
      throw new ApiError({
        code: "VALIDATION_ERROR",
        message: "requestId e decision (confirm|deny) sao obrigatorios",
        status: 400,
      });
    }

    const { id: massId } = await context.params;
    const mass = await confirmMassAction({ massId, actor, requestId: requestToReview, decision });

    logInfo(requestId, "Mass confirmation reviewed", { massId, decision, actorRole: actor.role });
    return jsonOk({ ok: true, mass: serializeMass(mass) }, requestId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      logError(requestId, "Erro ao confirmar/recusar acÃ³lito", error);
    }

    return toHttpResponse(error, requestId);
  }
}
