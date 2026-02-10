import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  return toHttpResponse(
    new ApiError({
      code: "FORBIDDEN",
      message: "Auto cadastro desabilitado. Solicite criação de conta a um CERIMONIARIO.",
      status: 403,
    }),
    requestId
  );
}
