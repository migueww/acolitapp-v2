import clientPromise from "@/lib/mongodb";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    const client = await clientPromise;
    const db = client.db("acolitapp-db");

    const user = await db.collection("users").findOne({ email });

    if (!user || user.password !== password) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
    }

    return NextResponse.json({ message: "Login bem-sucedido", user });
  } catch (error) {
    console.error("Erro no servidor:", error);
    return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
  }
}
