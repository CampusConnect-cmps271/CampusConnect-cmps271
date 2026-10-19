import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/auth";
import { countMyUnreadConversations } from "@/modules/messaging";

/**
 * The signed-in student's unread conversation count, for the header badge,
 * which re-reads it after navigations. `count` is null when it cannot be read.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const count = await countMyUnreadConversations();

  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
