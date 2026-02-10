import { NextResponse } from "next/server";
import bcrypt from "bcrypt";

import dbConnect from "@/lib/db";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";
import { getUserModel } from "@/models/User";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; email?: string; password?: string };
    const usernameValue =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase()
        : typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!usernameValue || !password) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    await dbConnect();

    const user = await getUserModel()
      .findOne({ username: usernameValue })
      .select("_id passwordHash role active")
      .lean();

    if (!user || !user.active) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    const token = await createSessionToken({
      userId: user._id.toString(),
      role: user.role,
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieOptions.name, token, {
      httpOnly: sessionCookieOptions.httpOnly,
      maxAge: sessionCookieOptions.maxAge,
      path: sessionCookieOptions.path,
      sameSite: sessionCookieOptions.sameSite,
      secure: sessionCookieOptions.secure,
    });

    return response;
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
