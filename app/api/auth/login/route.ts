import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { SignJWT } from "jose";

import dbConnect from "@/lib/db";
import { getUserModel } from "@/models/User";
import { resolveJwtSecret } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    await dbConnect();

    const user = await getUserModel().findOne({
      $or: [{ username: username.toLowerCase() }, { email: username.toLowerCase() }],
    }).lean();

    if (!user) {
      return NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );
    }

    const storedHash =
      typeof user.passwordHash === "string"
        ? user.passwordHash
        : typeof (user as { password?: string }).password === "string"
          ? (user as { password?: string }).password
          : "";

    if (!storedHash) {
      return NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(password, storedHash);

    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );
    }

    const encoder = new TextEncoder();
    const resolvedRole =
      user.role === "CERIMONIARIO" || user.role === "ACOLITO"
        ? user.role
        : "ACOLITO";

    const token = await new SignJWT({
      userId: user._id.toString(),
      role: resolvedRole,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(encoder.encode(resolveJwtSecret()));

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
