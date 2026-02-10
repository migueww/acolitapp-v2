import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { type DomainError, toErrorResponse, ValidationError } from "@/src/domain/mass/errors";
import { serializeMass } from "@/src/domain/mass/serializers";
import type { MassDocument } from "@/models/Mass";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ActionHandler = (input: { massId: string; actor: Awaited<ReturnType<typeof requireAuth>> }) => Promise<MassDocument>;

export const handleMassAction = async (
  req: Request,
  context: RouteContext,
  actionHandler: ActionHandler
): Promise<NextResponse> => {
  try {
    const actor = await requireAuth(req);
    await dbConnect();

    const { id: massId } = await context.params;
    const mass = await actionHandler({ massId, actor });

    return NextResponse.json({ ok: true, mass: serializeMass(mass) });
  } catch (error) {
    const mapped = toErrorResponse(error as DomainError);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    console.error("Erro em ação de missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
};

export const parseJson = async <T>(req: Request): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError("JSON inválido");
  }
};
