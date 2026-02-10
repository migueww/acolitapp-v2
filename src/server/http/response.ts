import { NextResponse } from "next/server";

export const jsonOk = <T>(data: T, requestId: string, init?: { status?: number }): NextResponse =>
  NextResponse.json(data, {
    status: init?.status,
    headers: { "x-request-id": requestId },
  });
