import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { getMassTypeTemplateMap } from "@/src/domain/liturgy/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();
    const templates = await getMassTypeTemplateMap({ activeOnly: true });
    return jsonOk(templates, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
