
"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import {
  EVENT_TIMEZONE,
  getEventValues,
  validateEvent,
  type EventActionState,
} from "./validation";

type ManagementState = EventActionState & {
  eventId?: string;
  revision?: number;
};

function failed(message: string): ManagementState {
  return {
    success: false,
    message,
    errors: {},
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function readRevision(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    return null;
  }

  return number;
}

function readEventId(formData: FormData) {
  const value = formData.get("eventId");

  if (typeof value !== "string" || !isUuid(value)) {
    return null;
  }

  return value;
}

async function getSupabase() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase configuration is missing.",
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
          // Some server rendering contexts cannot write cookies.
        }
      },
    },
  });
}

async function getAuthorizedSession() {
  const supabase = await getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (
    authError ||
    !user ||
    !user.email_confirmed_at
  ) {
    return {
      supabase,
      user: null,
      error: "Please sign in with a verified account.",
    };
  }

  const {
    data: allowed,
    error: permissionError,
  } = await supabase.rpc("can_manage_events");

  if (permissionError || allowed !== true) {
    return {
      supabase,
      user: null,
      error:
        "Your account does not have permission to manage events.",
    };
  }

  return {
    supabase,
    user,
    error: null,
  };
}

// Edit an existing event or publish an existing draft.
export async function updateEventAction(
  _previousState: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const eventId = readEventId(formData);
  const expectedRevision = readRevision(
    formData.get("revision"),
  );

  if (!eventId || expectedRevision === null) {
    return failed("Invalid event information.");
  }

  const intent = formData.get("intent");

  if (intent !== "draft" && intent !== "published") {
    return failed("Choose Save Changes or Publish Event.");
  }

  const session = await getAuthorizedSession();

  if (!session.user) {
    return failed(session.error ?? "Not authorized.");
  }

  const { data: existing, error: fetchError } =
    await session.supabase
      .from("events")
      .select("id, organizer_id, status, revision")
      .eq("id", eventId)
      .maybeSingle();

  if (fetchError) {
    return failed("Could not load the event.");
  }

  if (!existing) {
    return failed("Event not found or access denied.");
  }

  if (existing.organizer_id !== session.user.id) {
    return failed("You can only edit your own events.");
  }

  if (existing.status === "cancelled") {
    return failed("Cancelled events cannot be edited.");
  }

  if (existing.revision !== expectedRevision) {
    return failed(
      "This event has changed. Reload it before saving.",
    );
  }

  if (
    existing.status === "published" &&
    intent === "draft"
  ) {
    return failed(
      "A published event cannot return to draft.",
    );
  }

  const values = getEventValues(formData);
  const result = validateEvent(values, intent);

  if (
    !result.valid ||
    !result.startsAt ||
    !result.endsAt
  ) {
    return {
      success: false,
      message: "Please correct the highlighted fields.",
      errors: result.errors,
    };
  }

  const { data: updated, error: updateError } =
    await session.supabase
      .from("events")
      .update({
        title: values.title,
        description: values.description,
        starts_at: result.startsAt,
        ends_at: result.endsAt,
        timezone: EVENT_TIMEZONE,
        location: values.location,
        category: values.category,
        registration_url: values.registrationUrl || null,
        club_name: values.clubName || null,
        status: intent,
      })
      .eq("id", eventId)
      .eq("organizer_id", session.user.id)
      .eq("revision", expectedRevision)
      .neq("status", "cancelled")
      .select("id, revision")
      .maybeSingle();

  if (updateError) {
    console.error(
      "Event update failed:",
      updateError.code,
    );

    return failed("Could not update the event.");
  }

  if (!updated) {
    return failed(
      "This event has changed or is no longer available. Reload before saving.",
    );
  }

  return {
    success: true,
    message:
      intent === "published"
        ? "Event published successfully."
        : "Event changes saved successfully.",
    errors: {},
    eventId: updated.id,
    revision: updated.revision,
  };
}

// Cancel an event without removing its database record.
export async function cancelEventAction(
  _previousState: ManagementState,
  formData: FormData,
): Promise<ManagementState> {
  const eventId = readEventId(formData);
  const expectedRevision = readRevision(
    formData.get("revision"),
  );

  if (!eventId || expectedRevision === null) {
    return failed("Invalid event information.");
  }

  const session = await getAuthorizedSession();

  if (!session.user) {
    return failed(session.error ?? "Not authorized.");
  }

  const { data: existing, error: fetchError } =
    await session.supabase
      .from("events")
      .select("id, organizer_id, status, revision")
      .eq("id", eventId)
      .maybeSingle();

  if (fetchError) {
    return failed("Could not load the event.");
  }

  if (!existing) {
    return failed("Event not found or access denied.");
  }

  if (existing.organizer_id !== session.user.id) {
    return failed(
      "You can only cancel your own events.",
    );
  }

  if (existing.status === "cancelled") {
    return failed("This event is already cancelled.");
  }

  if (existing.revision !== expectedRevision) {
    return failed(
      "This event has changed. Reload before cancelling.",
    );
  }

  const { data: cancelled, error: cancelError } =
    await session.supabase
      .from("events")
      .update({
        status: "cancelled",
      })
      .eq("id", eventId)
      .eq("organizer_id", session.user.id)
      .eq("revision", expectedRevision)
      .neq("status", "cancelled")
      .select("id, revision")
      .maybeSingle();

  if (cancelError) {
    console.error(
      "Event cancellation failed:",
      cancelError.code,
    );

    return failed("Could not cancel the event.");
  }

  if (!cancelled) {
    return failed(
      "This event has changed or is no longer available. Reload before cancelling.",
    );
  }

  return {
    success: true,
    message: "Event cancelled successfully.",
    errors: {},
    eventId: cancelled.id,
    revision: cancelled.revision,
  };
}
