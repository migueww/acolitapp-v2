import { NextResponse } from "next/server";

import { requireCerimoniario } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireCerimoniario(req);
    return NextResponse.json({ ok: true, user: { id: user.userId, role: user.role } });
  } catch (error) {
    if (error instanceof Error && error.message === "Acesso negado") {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
