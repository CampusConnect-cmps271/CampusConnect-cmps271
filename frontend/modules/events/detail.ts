
import "server-only";

import { createEventServerClient } from "./server";

export type EventDetail = {
  id: string;
  organizer_id: string;
  organizer_display_name: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  category: string;
  status: "draft" | "published" | "cancelled";
  registration_url: string | null;
  club_name: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  is_owner: boolean;
};

export type EventDetailResult =
  | {
      success: true;
      event: EventDetail;
    }
  | {
      success: false;
      reason:
        | "invalid_id"
        | "unauthenticated"
        | "not_found"
        | "database_error";
      message: string;
    };

type EventRow = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  category: string;
  status: "draft" | "published" | "cancelled";
  registration_url: string | null;
  club_name: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
};

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getEventDetail(
  eventId: string,
): Promise<EventDetailResult> {
  if (
    typeof eventId !== "string" ||
    !isValidUuid(eventId)
  ) {
    return {
      success: false,
      reason: "invalid_id",
      message: "Invalid event ID.",
    };
  }

  const supabase = await createEventServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      reason: "unauthenticated",
      message: "Please sign in to view event details.",
    };
  }

  // Published events are visible to signed-in students.
  // Private drafts and cancelled events are visible
  // only to their organizer through this lookup.
  //
  // The database RLS policies provide an additional
  // authorization boundary.

  const { data, error } = await supabase
    .from("events")
    .select(
      [
        "id",
        "organizer_id",
        "title",
        "description",
        "starts_at",
        "ends_at",
        "timezone",
        "location",
        "category",
        "status",
        "registration_url",
        "club_name",
        "created_at",
        "updated_at",
        "revision",
      ].join(","),
    )
    .eq("id", eventId)
    .or(
      `status.eq.published,organizer_id.eq.${user.id}`,
    )
    .maybeSingle();

  if (error) {
    console.error(
      "Event detail lookup failed:",
      error.code,
    );

    return {
      success: false,
      reason: "database_error",
      message:
        "Could not load this event. Please try again.",
    };
  }

  if (!data) {
    // Do not disclose whether a private event exists.
    return {
      success: false,
      reason: "not_found",
      message:
        "This event does not exist or is not available.",
    };
  }

  const event = data as unknown as EventRow;

  const isOwner = event.organizer_id === user.id;

  if (event.status !== "published" && !isOwner) {
    return {
      success: false,
      reason: "not_found",
      message:
        "This event does not exist or is not available.",
    };
  }

  // Profiles are already part of the existing project.
  // The organizer's account ID is used only for lookup.
  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", event.organizer_id)
      .maybeSingle();

  if (profileError) {
    console.error(
      "Event organizer profile lookup failed:",
      profileError.code,
    );

    return {
      success: false,
      reason: "database_error",
      message:
        "Could not load this event. Please try again.",
    };
  }

  const displayName =
    typeof profile?.full_name === "string" &&
    profile.full_name.trim()
      ? profile.full_name.trim()
      : "Campus organizer";

  return {
    success: true,
    event: {
      id: event.id,
      organizer_id: event.organizer_id,
      organizer_display_name: displayName,
      title: event.title,
      description: event.description,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      timezone: event.timezone,
      location: event.location,
      category: event.category,
      status: event.status,
      registration_url: event.registration_url,
      club_name: event.club_name,
      created_at: event.created_at,
      updated_at: event.updated_at,
      revision: event.revision,
      is_owner: isOwner,
    },
  };
}
