import clientPromise from '@/lib/mongodb';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const { name, email, password } = await req.json();
    
        const client = await clientPromise;
        const db = client.db("acolitapp-db");
    
        const user = await db.collection("users").findOne({ email });
    
        console.log(user);
    
        if (user) {
          return NextResponse.json({ error: "Usuário já cadastrado" }, { status: 401 });
        }
    
        await db.collection("users").insertOne({ name, email, password });
    
        return NextResponse.json({ message: "Cadastro bem-sucedido" });
    } catch (error) {
        console.error("Erro no servidor:", error);
        return NextResponse.json({ error: "Erro no servidor" }, { status: 500 });
    }
}
