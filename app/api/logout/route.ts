import { sessionCookieOptions } from "@/lib/auth";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const response = jsonOk({ ok: true }, requestId);

  response.cookies.set(sessionCookieOptions.name, "", {
    httpOnly: sessionCookieOptions.httpOnly,
    maxAge: 0,
    path: sessionCookieOptions.path,
    sameSite: sessionCookieOptions.sameSite,
    secure: sessionCookieOptions.secure,
  });

  return response;
}
