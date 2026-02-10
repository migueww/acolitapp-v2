import { requireCerimoniario } from "@/lib/auth";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { toHttpResponse } from "@/src/server/http/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const user = await requireCerimoniario(req);
    return jsonOk({ ok: true, user: { id: user.userId, role: user.role } }, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
