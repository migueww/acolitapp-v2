import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/db";
import { toHttpResponse } from "@/src/server/http/errors";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";
import { listLiturgyMassTypes, listLiturgyRoles } from "@/src/domain/liturgy/service";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await requireAuth(req);
    await dbConnect();

    const [roles, massTypes] = await Promise.all([listLiturgyRoles(), listLiturgyMassTypes()]);

    return jsonOk(
      {
        roles: roles.map((role) => ({
          key: role.key,
          label: role.label,
          description: role.description ?? "",
          score: typeof role.score === "number" ? role.score : 0,
          active: Boolean(role.active),
        })),
        massTypes: massTypes.map((massType) => ({
          key: massType.key,
          label: massType.label,
          roleKeys: Array.isArray(massType.roleKeys) ? massType.roleKeys : [],
          fallbackRoleKey: typeof massType.fallbackRoleKey === "string" ? massType.fallbackRoleKey : null,
          active: Boolean(massType.active),
        })),
      },
      requestId
    );
  } catch (error) {
    return toHttpResponse(error, requestId);
  }
}
