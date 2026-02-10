import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { getUserModel } from "@/models/User";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const setupToken = req.headers.get("x-setup-token");
    const expectedToken = process.env.SETUP_TOKEN;

    if (!expectedToken || setupToken !== expectedToken) {
      return NextResponse.json({ error: "Setup token inválido" }, { status: 403 });
    }

    await dbConnect();

    const existingCerimoniario = await getUserModel().exists({ role: "CERIMONIARIO" });
    if (existingCerimoniario) {
      return NextResponse.json(
        { error: "Bootstrap já concluído. CERIMONIARIO já existe." },
        { status: 409 }
      );
    }

    const body = (await req.json()) as { name?: string; username?: string; password?: string };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !username || !password) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const existingUsername = await getUserModel().exists({ username });
    if (existingUsername) {
      return NextResponse.json({ error: "Username já em uso" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await getUserModel().create({
      name,
      username,
      passwordHash,
      role: "CERIMONIARIO",
      active: true,
    });

    return NextResponse.json({ ok: true, message: "CERIMONIARIO inicial criado com sucesso" });
  } catch (error) {
    console.error("Erro no setup:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
