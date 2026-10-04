import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

function result(status: number, message: string) {
  return NextResponse.json(
    { connected: status === 200, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const config = getSupabaseConfig();

  if (!config) {
    return result(503, "Add your Supabase project URL and publishable key to frontend/.env, then restart the app.");
  }

  try {
    // Read public Auth settings to check connectivity without creating users or tables.
    const response = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return result(502, "Supabase rejected the connection. Check that the URL and publishable key belong to the same project.");
    }

    const settings = await response.json();
    if (!settings || typeof settings.external !== "object" || settings.external === null) {
      return result(502, "The project did not return Supabase Auth settings. Check the project URL.");
    }

    return result(200, "Connected to Supabase Auth. The setup is ready for your first task.");
  } catch {
    return result(502, "Could not reach Supabase. Check your internet connection and project URL, then try again.");
  }
}
