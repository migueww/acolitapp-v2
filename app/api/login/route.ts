import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

import bcrypt from "bcrypt";
import { SignJWT } from 'jose';

const SECRET_KEY = process.env.JWT_SECRET_KEY as string;

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const client = await clientPromise;
    const db = client.db("acolitapp-db");

    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    const encoder = new TextEncoder();
    const token = await new SignJWT({ userId: user._id, email: user.email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('2h')
      .sign(encoder.encode(SECRET_KEY));


    const response = NextResponse.json({ message: 'Login bem-sucedido' });
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 2,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
