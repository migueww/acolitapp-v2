import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { requestMassConfirmationAction } from "@/src/domain/mass/actions";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { logError, logInfo } from "@/src/server/http/logging";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);

  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const { id: massId } = await context.params;
    const result = await requestMassConfirmationAction({ massId, actor });
    const qrPayload = JSON.stringify({
      type: "MASS_CONFIRMATION",
      massId,
      requestId: result.requestId,
    });

    logInfo(requestId, "Mass confirmation requested", { massId, actorRole: actor.role });
    return jsonOk({ ok: true, requestId: result.requestId, qrPayload }, requestId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      logError(requestId, "Erro ao solicitar confirmaÃ§Ã£o de presenÃ§a", error);
    }
    return toHttpResponse(error, requestId);
  }
}
