import { requireAuth } from "@/lib/auth";
import { MASS_ROLE_TEMPLATES } from "@/src/domain/mass/role-templates";
import { toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    return jsonOk(MASS_ROLE_TEMPLATES, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
