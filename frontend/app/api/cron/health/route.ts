import { NextResponse } from "next/server";
import { notifyHealthAlerts, runHealthChecks } from "@/modules/monitoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const snapshot = await runHealthChecks();
  const deliveries = await notifyHealthAlerts(snapshot);
  return NextResponse.json(
    {
      ...snapshot,
      alerts: deliveries.map((delivery) => delivery.status),
    },
    {
      status: snapshot.overall === "unhealthy" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
