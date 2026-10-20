import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth";
import { getMyNotificationSummary } from "@/modules/notifications";

/**
 * The signed-in student's unread count and newest notifications, for the
 * bell, which re-reads them when Realtime reports a change.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const summary = await getMyNotificationSummary();
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503 });
  }
}
