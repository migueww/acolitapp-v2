import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getMassModel } from "@/models/Mass";
import { getMongoose } from "@/lib/mongoose";

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

    return NextResponse.json({
      id: mass._id.toString(),
      status: mass.status,
      scheduledAt: mass.scheduledAt,
      createdBy: mass.createdBy.toString(),
      chiefBy: mass.chiefBy.toString(),
      openedAt: mass.openedAt ?? null,
      preparationAt: mass.preparationAt ?? null,
      finishedAt: mass.finishedAt ?? null,
      canceledAt: mass.canceledAt ?? null,
      attendance: {
        joined: mass.attendance?.joined?.map((entry) => ({
          userId: entry.userId.toString(),
          joinedAt: entry.joinedAt,
        })) ?? [],
        confirmed: mass.attendance?.confirmed?.map((entry) => ({
          userId: entry.userId.toString(),
          confirmedAt: entry.confirmedAt,
        })) ?? [],
      },
      assignments:
        mass.assignments?.map((assignment) => ({
          roleKey: assignment.roleKey,
          userId: assignment.userId ? assignment.userId.toString() : null,
        })) ?? [],
      events:
        mass.events?.map((event) => ({
          type: event.type,
          actorId: event.actorId.toString(),
          at: event.at,
          payload: event.payload ?? null,
        })) ?? [],
      createdAt: mass.createdAt,
      updatedAt: mass.updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Não autorizado") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("Erro ao detalhar missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
