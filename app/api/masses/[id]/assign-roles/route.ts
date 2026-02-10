import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";
import { assignRolesMassAction } from "@/src/domain/mass/actions";
import { toErrorResponse, ValidationError } from "@/src/domain/mass/errors";
import { serializeMass } from "@/src/domain/mass/serializers";

export const runtime = "nodejs";

type InputAssignment = {
  roleKey?: unknown;
  userId?: unknown;
};

const normalizeAssignments = async (rawAssignments: unknown) => {
  if (!Array.isArray(rawAssignments)) {
    throw new ValidationError("assignments deve ser um array");
  }

  const mongoose = getMongoose();

  const assignments = rawAssignments.map((assignmentRaw) => {
    const assignment = assignmentRaw as InputAssignment;

    const roleKey = typeof assignment.roleKey === "string" ? assignment.roleKey.trim().toUpperCase() : "";
    if (!roleKey) {
      throw new ValidationError("roleKey inválido em assignments");
    }

    const userIdRaw = assignment.userId;
    if (userIdRaw === null || userIdRaw === undefined) {
      return { roleKey, userId: null };
    }

    if (typeof userIdRaw !== "string" || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
      throw new ValidationError("userId inválido em assignments");
    }

    return { roleKey, userId: new mongoose.Types.ObjectId(userIdRaw) };
  });

  const userIds = assignments
    .filter((assignment) => assignment.userId !== null)
    .map((assignment) => assignment.userId!.toString());

  if (userIds.length > 0) {
    const uniqueIds = Array.from(new Set(userIds));
    const validUsersCount = await getUserModel().countDocuments({
      _id: { $in: uniqueIds },
      role: "ACOLITO",
      active: true,
    });

    if (validUsersCount !== uniqueIds.length) {
      throw new ValidationError("Todos os userId em assignments devem ser ACOLITO ativo");
    }
  }

  return assignments;
};

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { assignments?: unknown };
    const assignments = await normalizeAssignments(body.assignments);

    const { id: massId } = await context.params;
    const mass = await assignRolesMassAction({ massId, actor, assignments });

    return NextResponse.json({ ok: true, mass: serializeMass(mass) });
  } catch (error) {
    const mapped = toErrorResponse(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    console.error("Erro ao atribuir funções da missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
