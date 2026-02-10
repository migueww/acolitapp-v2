import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { requireCerimoniario } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";
import { getUserModel } from "@/models/User";

export const runtime = "nodejs";

const isValidRole = (role: unknown): role is UserRole => role === "CERIMONIARIO" || role === "ACOLITO";

export async function POST(req: Request) {
  try {
    await requireCerimoniario(req);
    await dbConnect();

    const body = (await req.json()) as {
      name?: string;
      username?: string;
      password?: string;
      role?: UserRole;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role;

    if (!name || !username || !password || !isValidRole(role)) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const existingUser = await getUserModel().exists({ username });
    if (existingUser) {
      return NextResponse.json({ error: "Username já em uso" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await getUserModel().create({
      name,
      username,
      passwordHash,
      role,
      active: true,
    });

    return NextResponse.json(
      {
        ok: true,
        user: {
          id: createdUser._id.toString(),
          name: createdUser.name,
          username: createdUser.username,
          role: createdUser.role,
          active: createdUser.active,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Não autorizado" || error.message === "Acesso negado")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Não autorizado" ? 401 : 403 });
    }

    console.error("Erro ao criar usuário:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
