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

    const user = await getUserModel().findById(auth.userId).select("_id role name username active globalScore").lean();
    if (!user) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Nao autorizado", status: 401 });
    }

    return jsonOk(
      {
        id: user._id.toString(),
        role: user.role,
        name: user.name,
        username: user.username,
        active: user.active,
        globalScore: typeof user.globalScore === "number" ? user.globalScore : 50,
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}

export async function PATCH(req: Request) {
  const requestId = getRequestId(req);

  try {
    const auth = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { name?: unknown; username?: unknown };
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "name invalido", status: 400 });
      }
      updates.name = name;
    }

    if (body.username !== undefined) {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!username) {
        throw new ApiError({ code: "VALIDATION_ERROR", message: "username/email invalido", status: 400 });
      }

      const conflict = await getUserModel().exists({ _id: { $ne: auth.userId }, username });
      if (conflict) {
        throw new ApiError({ code: "CONFLICT", message: "Username/email ja em uso", status: 409 });
      }

      updates.username = username;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError({ code: "VALIDATION_ERROR", message: "Nenhuma alteracao enviada", status: 400 });
    }

    const user = await getUserModel()
      .findByIdAndUpdate(auth.userId, { $set: updates }, { new: true })
      .select("_id role name username active globalScore")
      .lean();
    if (!user) {
      throw new ApiError({ code: "UNAUTHENTICATED", message: "Nao autorizado", status: 401 });
    }

    return jsonOk(
      {
        ok: true,
        user: {
          id: user._id.toString(),
          role: user.role,
          name: user.name,
          username: user.username,
          active: user.active,
          globalScore: typeof user.globalScore === "number" ? user.globalScore : 50,
        },
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
