import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getUserModel } from "@/models/User";
import { ApiError, toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { currentPassword?: unknown; newPassword?: unknown };
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword || !newPassword) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Dados invalidos", status: 400 });
    }

    if (newPassword.length < 6) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Nova senha deve ter ao menos 6 caracteres", status: 400 });
    }

    const user = await getUserModel().findById(auth.userId).select("_id active passwordHash").lean();
    if (!user || !user.active) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Nao autorizado", status: 401 });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Senha atual incorreta", status: 401 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await getUserModel().findByIdAndUpdate(auth.userId, { $set: { passwordHash } });

    return jsonOk({ ok: true }, requestId);
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
