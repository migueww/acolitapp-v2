import { getAuth } from "@/lib/auth";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await getAuth(req);

    if (!auth) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Não autorizado", status: 401 });
    }

    return jsonOk({ authenticated: true, user: { id: auth.userId, role: auth.role } }, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
