import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { SignJWT } from "jose";

import dbConnect from "@/lib/db";
import { getUserModel } from "@/models/User";
import { resolveJwtSecret } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    await dbConnect();

    const user = await getUserModel().findOne({
      $or: [{ username: email.toLowerCase() }, { email: email.toLowerCase() }],
    }).lean();

    if (!user) {
      const response = NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );

      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
        path: "/",
      });

      return response;
    }

    const storedHash =
      typeof user.passwordHash === "string"
        ? user.passwordHash
        : typeof (user as { password?: string }).password === "string"
          ? (user as { password?: string }).password
          : "";

    if (!storedHash) {
      const response = NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );

      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
        path: "/",
      });

      return response;
    }

    const passwordMatch = await bcrypt.compare(password, storedHash);

    if (!passwordMatch) {
      const response = NextResponse.json(
        { error: "Usuário ou senha incorretos" },
        { status: 401 }
      );

      response.cookies.set("auth-token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 0,
        path: "/",
      });

      return response;
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

    const response = NextResponse.json({ message: "Login bem-sucedido" });
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 2,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
