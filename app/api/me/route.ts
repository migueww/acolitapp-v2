import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const user = await getUserModel().findById(auth.userId).select("_id role name").lean();
    if (!user) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Não autorizado", status: 401 });
    }

    return jsonOk({ id: user._id.toString(), role: user.role, name: user.name }, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
