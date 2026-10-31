
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EventSaveState = {
  success: boolean;
  message: string;
  saved: boolean | null;
  reminderEnabled: boolean | null;
  minutesBefore: number | null;
  version: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REMINDER_OPTIONS = new Set([
  0, 15, 30, 60, 120, 1440,
]);

function fail(
  previous: EventSaveState,
  message: string,
): EventSaveState {
  return {
    ...previous,
    success: false,
    message,
    version: previous.version + 1,
  };
}

export async function changeEventSaveAction(
  previous: EventSaveState,
  formData: FormData,
): Promise<EventSaveState> {
  const eventId = formData.get("eventId");
  const intent = formData.get("intent");

  if (
    typeof eventId !== "string" ||
    !UUID_PATTERN.test(eventId)
  ) {
    return fail(previous, "Invalid event ID.");
  }

  if (
    intent !== "save" &&
    intent !== "unsave" &&
    intent !== "preferences"
  ) {
    return fail(previous, "Invalid action.");
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return fail(
      previous,
      "You must sign in to save events.",
    );
  }

  const reminderEnabled =
    formData.get("reminderEnabled") === "on";

  const rawMinutes = formData.get("minutesBefore");
  const minutesBefore = Number(rawMinutes);

  if (
    intent !== "unsave" &&
    (
      typeof rawMinutes !== "string" ||
      !REMINDER_OPTIONS.has(minutesBefore)
    )
  ) {
    return fail(
      previous,
      "Select a valid reminder time.",
    );
  }

  try {
    if (intent === "save") {
      const { data: event, error: eventError } =
        await supabase
          .from("events")
          .select("id, status")
          .eq("id", eventId)
          .eq("status", "published")
          .maybeSingle();

      if (eventError) {
        throw eventError;
      }

      if (!event) {
        return fail(
          previous,
          "This event is not available to save.",
        );
      }

      const { error } = await supabase
        .from("saved_events")
        .insert({
          student_id: user.id,
          event_id: eventId,
          reminder_enabled: reminderEnabled,
          reminder_minutes_before: minutesBefore,
        });

      if (error) {
        if (error.code === "23505") {
          return fail(
            previous,
            "This event is already saved.",
          );
        }

        if (
          error.code === "23514" ||
          error.code === "23503"
        ) {
          return fail(
            previous,
            "Only upcoming published events can be saved.",
          );
        }

        throw error;
      }

      revalidatePath(`/events/${eventId}`);

      return {
        success: true,
        message: "Event saved successfully.",
        saved: true,
        reminderEnabled,
        minutesBefore,
        version: previous.version + 1,
      };
    }

    if (intent === "unsave") {
      const { error } = await supabase
        .from("saved_events")
        .delete()
        .eq("student_id", user.id)
        .eq("event_id", eventId);

      if (error) {
        throw error;
      }

      revalidatePath(`/events/${eventId}`);

      return {
        success: true,
        message: "Event removed from saved events.",
        saved: false,
        reminderEnabled: false,
        minutesBefore: 60,
        version: previous.version + 1,
      };
    }

    const { data, error } = await supabase
      .from("saved_events")
      .update({
        reminder_enabled: reminderEnabled,
        reminder_minutes_before: minutesBefore,
      })
      .eq("student_id", user.id)
      .eq("event_id", eventId)
      .select(
        "student_id, reminder_enabled, reminder_minutes_before",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return fail(
        previous,
        "Save this event before setting a reminder.",
      );
    }

    revalidatePath(`/events/${eventId}`);

    return {
      success: true,
      message: reminderEnabled
        ? "Reminder preferences updated."
        : "Reminder disabled. The event remains saved.",
      saved: true,
      reminderEnabled,
      minutesBefore,
      version: previous.version + 1,
    };
  } catch {
    return fail(
      previous,
      "Could not update this event. Please try again.",
    );
  }
}
