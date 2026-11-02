
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import {
  EVENT_TIMEZONE,
  getEventValues,
  validateEvent,
  type EventActionState,
} from "./validation";

async function getSupabase() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase URL or publishable key is missing.",
    );
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const item of items) {
            cookieStore.set(
              item.name,
              item.value,
              item.options,
            );
          }
        } catch {
          // Server Components may disallow cookie writes.
        }
      },
    },
  });
}

export async function createEventAction(
  _previousState: EventActionState,
  formData: FormData,
): Promise<EventActionState> {
  const mode =
    formData.get("intent") === "published"
      ? "published"
      : formData.get("intent") === "draft"
        ? "draft"
        : null;

  if (!mode) {
    return {
      success: false,
      message: "Choose Save Draft or Publish Event.",
      errors: {},
    };
  }

  const values = getEventValues(formData);
  const result = validateEvent(values, mode);

  if (!result.valid || !result.startsAt || !result.endsAt) {
    return {
      success: false,
      message: "Please correct the highlighted fields.",
      errors: result.errors,
    };
  }

  const supabase = await getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email_confirmed_at) {
    return {
      success: false,
      message: "Please sign in with a verified account.",
      errors: {},
    };
  }

  // Check actual database permission, not a client-supplied role.
  const { data: canManage, error: permissionError } =
    await supabase.rpc("can_manage_events");

  if (permissionError || canManage !== true) {
    return {
      success: false,
      message:
        "Your account does not have permission to create events.",
      errors: {},
    };
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      organizer_id: user.id,
      title: values.title,
      description: values.description,
      starts_at: result.startsAt,
      ends_at: result.endsAt,
      timezone: EVENT_TIMEZONE,
      location: values.location,
      category: values.category,
      status: mode,
      registration_url: values.registrationUrl || null,
      club_name: values.clubName || null,
    })
    .select("id")
    .single();

  if (error || !event) {
    console.error("Event creation failed:", error?.code);

    return {
      success: false,
      message:
        "Could not save the event. Please try again.",
      errors: {},
    };
  }

  // Event detail route will be added in SP3-23.
  redirect(mode === "published" ? "/events" : "/");
}
