
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth";
import { countMyUnreadConversations } from "@/modules/messaging";
import { trackApiRequest } from "@/modules/logging/api-metrics";

async function getUnreadCount(): Promise<Response> {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Sign in first." },
      { status: 401 },
    );
  }

  const count = await countMyUnreadConversations();

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = trackApiRequest(
  "/api/messages/unread-count",
  "GET",
  getUnreadCount,
);
