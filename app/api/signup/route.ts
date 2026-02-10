import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Auto cadastro desabilitado. Solicite criação de conta a um CERIMONIARIO." },
    { status: 403 }
  );
}
