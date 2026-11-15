
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth";
import { getMyNotificationSummary } from "@/modules/notifications";
import { trackApiRequest } from "@/modules/logging/api-metrics";

async function getNotifications(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in first." },
      { status: 401 },
    );
  }

  try {
    const summary = await getMyNotificationSummary();

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Notifications are unavailable." },
      { status: 503 },
    );
  }
}

export const GET = trackApiRequest(
  "/api/notifications",
  "GET",
  getNotifications,
);
