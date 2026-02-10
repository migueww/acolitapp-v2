import { NextResponse } from "next/server";

import dbConnect from "@/lib/db";
import { requireAuth, requireCerimoniario } from "@/lib/auth";
import { MASS_STATUSES, type MassStatus, getMassModel } from "@/models/Mass";
import { getMongoose } from "@/lib/mongoose";
import { getUserModel } from "@/models/User";

export const runtime = "nodejs";

const isValidDate = (value: string): boolean => !Number.isNaN(new Date(value).getTime());
const isMassStatus = (value: unknown): value is MassStatus =>
  typeof value === "string" && MASS_STATUSES.includes(value as MassStatus);

export async function POST(req: Request) {
  try {
    const auth = await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as {
      scheduledAt?: string;
      chiefBy?: string;
      assignments?: Array<{ roleKey?: unknown; userId?: unknown }>;
    };

    if (!body.scheduledAt || !isValidDate(body.scheduledAt)) {
      return NextResponse.json({ error: "scheduledAt inválido" }, { status: 400 });
    }

    const mongoose = getMongoose();
    const createdBy = new mongoose.Types.ObjectId(auth.userId);

    let chiefBy = createdBy;
    if (typeof body.chiefBy === "string") {
      if (!mongoose.Types.ObjectId.isValid(body.chiefBy)) {
        return NextResponse.json({ error: "chiefBy inválido" }, { status: 400 });
      }

      const chiefUser = await getUserModel()
        .findOne({ _id: body.chiefBy, role: "CERIMONIARIO", active: true })
        .select("_id")
        .lean();

      if (!chiefUser) {
        return NextResponse.json({ error: "chiefBy deve ser um CERIMONIARIO ativo" }, { status: 400 });
      }

      chiefBy = new mongoose.Types.ObjectId(body.chiefBy);
    }

    const assignments =
      body.assignments?.map((assignment) => {
        const roleKey = typeof assignment.roleKey === "string" ? assignment.roleKey.trim() : "";

        if (!roleKey) {
          throw new Error("roleKey inválido");
        }

        const userIdRaw = assignment.userId;
        if (userIdRaw === null || userIdRaw === undefined) {
          return { roleKey, userId: null };
        }

        if (typeof userIdRaw !== "string" || !mongoose.Types.ObjectId.isValid(userIdRaw)) {
          throw new Error("userId inválido em assignments");
        }

        return { roleKey, userId: new mongoose.Types.ObjectId(userIdRaw) };
      }) ?? [];

    const mass = await getMassModel().create({
      scheduledAt: new Date(body.scheduledAt),
      createdBy,
      chiefBy,
      assignments,
    });

    return NextResponse.json({ massId: mass._id.toString() }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Não autorizado") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }

      if (error.message === "Acesso negado") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }

      if (error.message === "roleKey inválido" || error.message === "userId inválido em assignments") {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    console.error("Erro ao criar missa:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    await requireAuth(req);
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const filter: {
      status?: MassStatus;
      scheduledAt?: {
        $gte?: Date;
        $lte?: Date;
      };
    } = {};

    if (statusParam) {
      if (!isMassStatus(statusParam)) {
        return NextResponse.json({ error: "status inválido" }, { status: 400 });
      }
      filter.status = statusParam;
    }

    if (fromParam || toParam) {
      filter.scheduledAt = {};

      if (fromParam) {
        if (!isValidDate(fromParam)) {
          return NextResponse.json({ error: "from inválido" }, { status: 400 });
        }
        filter.scheduledAt.$gte = new Date(fromParam);
      }

      if (toParam) {
        if (!isValidDate(toParam)) {
          return NextResponse.json({ error: "to inválido" }, { status: 400 });
        }
        filter.scheduledAt.$lte = new Date(toParam);
      }
    }

    const masses = await getMassModel()
      .find(filter)
      .sort({ scheduledAt: 1 })
      .select("_id status scheduledAt chiefBy createdBy")
      .lean();

    return NextResponse.json({
      items: masses.map((mass) => ({
        id: mass._id.toString(),
        status: mass.status,
        scheduledAt: mass.scheduledAt,
        chiefBy: mass.chiefBy?.toString(),
        createdBy: mass.createdBy?.toString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Não autorizado") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.error("Erro ao listar missas:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
