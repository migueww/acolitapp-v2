import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMassModel } from "@/models/Mass";
import { getMongoose } from "@/lib/mongoose";
import { serializeMass } from "@/src/domain/mass/serializers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: Request, context: RouteContext) {
  try {
    await requireAuth(req);
    await dbConnect();

    const { id } = await context.params;
    const mongoose = getMongoose();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const mass = await getMassModel().findById(id).lean();

    if (!mass) {
      return NextResponse.json({ error: "Missa não encontrada" }, { status: 404 });
    }

    return NextResponse.json(serializeMass(mass));
  } catch (error) {
    if (error instanceof Error && error.message === "Não autorizado") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("Erro ao detalhar missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
