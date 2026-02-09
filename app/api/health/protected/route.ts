import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req);
    return NextResponse.json({ ok: true, user: { id: user.id, role: user.role } });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
