import { NextResponse } from "next/server";
import { runHealthChecks } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await runHealthChecks();
  return NextResponse.json(snapshot, {
    status: snapshot.overall === "unhealthy" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
