import dbConnect from "@/lib/db";
import { getRequestId } from "@/src/server/http/request";
import { jsonOk } from "@/src/server/http/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_DB_TIMEOUT_MS = 1500;

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    await Promise.race([
      dbConnect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db-timeout")), HEALTH_DB_TIMEOUT_MS)),
    ]);
    return jsonOk({ ok: true, env: process.env.NODE_ENV ?? "unknown", db: "connected" }, requestId);
  } catch {
    return jsonOk({ ok: true, env: process.env.NODE_ENV ?? "unknown", db: "disconnected" }, requestId);
  }
}
