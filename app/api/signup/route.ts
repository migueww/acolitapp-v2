import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { getUserModel } from "@/models/User";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    await dbConnect();

    const normalizedUsername = email.toLowerCase();
    const existingUser = await getUserModel().findOne({
      $or: [{ username: normalizedUsername }, { email: normalizedUsername }],
    }).lean();

    if (existingUser) {
      return NextResponse.json({ error: "Usuário já cadastrado" }, { status: 401 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await getUserModel().create({
      name,
      username: normalizedUsername,
      passwordHash: hashedPassword,
      role: "ACOLITO",
      active: true,
    });

    return NextResponse.json({ message: "Cadastro bem-sucedido" });
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
