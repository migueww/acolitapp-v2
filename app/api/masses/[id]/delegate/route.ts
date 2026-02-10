import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";
import { delegateMassAction } from "@/src/domain/mass/actions";
import { toErrorResponse, ValidationError } from "@/src/domain/mass/errors";
import { serializeMass } from "@/src/domain/mass/serializers";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const body = (await req.json()) as { newChiefBy?: unknown };
    if (typeof body.newChiefBy !== "string" || !body.newChiefBy.trim()) {
      throw new ValidationError("newChiefBy é obrigatório");
    }

    const newChiefBy = body.newChiefBy.trim();
    const mongoose = getMongoose();
    if (!mongoose.Types.ObjectId.isValid(newChiefBy)) {
      throw new ValidationError("newChiefBy inválido");
    }

    const chiefUser = await getUserModel().findOne({ _id: newChiefBy, role: "CERIMONIARIO", active: true }).select("_id").lean();
    if (!chiefUser) {
      throw new ValidationError("newChiefBy deve ser um CERIMONIARIO ativo");
    }

    const { id: massId } = await context.params;
    const mass = await delegateMassAction({ massId, actor, newChiefBy });

    return NextResponse.json({ ok: true, mass: serializeMass(mass) });
  } catch (error) {
    const mapped = toErrorResponse(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    console.error("Erro ao delegar missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
