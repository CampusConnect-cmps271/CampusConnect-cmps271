
import "server-only";

import { createEventServerClient } from "./server";

export const EVENT_PAGE_SIZE = 20;
export const EVENT_MAX_PAGE_SIZE = 50;
export const EVENT_MAX_OFFSET = 1000;

export type EventDiscoveryFilters = {
  category?: string;
  startDate?: string;
  endDate?: string;
  includePast?: boolean;
  page?: number;
  pageSize?: number;
};

export type EventSummary = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  category: string;
  status: "published";
  registration_url: string | null;
  club_name: string | null;
};

export type EventDiscoveryResult = {
  events: EventSummary[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextPage: number | null;
  filters: {
    category: string | null;
    startDate: string | null;
    endDate: string | null;
    includePast: boolean;
  };
};

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function validateFilters(
  filters: EventDiscoveryFilters,
) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? EVENT_PAGE_SIZE;

  if (
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    throw new Error("Invalid event page number.");
  }

  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > EVENT_MAX_PAGE_SIZE
  ) {
    throw new Error(
      "Page size must be between 1 and 50.",
    );
  }

  const offset = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(offset) ||
    offset > EVENT_MAX_OFFSET
  ) {
    throw new Error(
      "Event pagination limit exceeded.",
    );
  }

  const category = filters.category?.trim() || null;
  const startDate = filters.startDate || null;
  const endDate = filters.endDate || null;

  if (category && category.length > 100) {
    throw new Error("Invalid event category.");
  }

  if (startDate && !isValidDate(startDate)) {
    throw new Error("Invalid start date.");
  }

  if (endDate && !isValidDate(endDate)) {
    throw new Error("Invalid end date.");
  }

  if (
    startDate &&
    endDate &&
    endDate < startDate
  ) {
    throw new Error(
      "End date cannot precede start date.",
    );
  }

  if (
    filters.includePast !== undefined &&
    typeof filters.includePast !== "boolean"
  ) {
    throw new Error("Invalid past-event filter.");
  }

  return {
    page,
    pageSize,
    offset,
    category,
    startDate,
    endDate,
    includePast: filters.includePast ?? false,
  };
}

export async function listPublishedEvents(
  filters: EventDiscoveryFilters = {},
): Promise<EventDiscoveryResult> {
  const checked = validateFilters(filters);
  const supabase = await createEventServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "You must be signed in to browse events.",
    );
  }

  const { data, error } = await supabase.rpc(
    "list_published_events",
    {
      p_category: checked.category,
      p_start_date: checked.startDate,
      p_end_date: checked.endDate,
      p_limit: checked.pageSize + 1,
      p_offset: checked.offset,
      p_include_past: checked.includePast,
    },
  );

  if (error) {
    console.error(
      "Event discovery failed:",
      error.code,
    );

    throw new Error(
      "Could not load events. Please try again.",
    );
  }

  const rows = (data ?? []) as EventSummary[];

  const hasMore =
    rows.length > checked.pageSize &&
    checked.offset + checked.pageSize <=
      EVENT_MAX_OFFSET;

  return {
    events: rows.slice(0, checked.pageSize),
    page: checked.page,
    pageSize: checked.pageSize,
    hasMore,
    nextPage: hasMore ? checked.page + 1 : null,
    filters: {
      category: checked.category,
      startDate: checked.startDate,
      endDate: checked.endDate,
      includePast: checked.includePast,
    },
  };
}

export async function listPublishedEventCategories(): Promise<
  string[]
> {
  const supabase = await createEventServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(
      "You must be signed in to browse event categories.",
    );
  }

  const { data, error } = await supabase.rpc(
    "list_published_event_categories",
  );

  if (error) {
    console.error(
      "Event category discovery failed:",
      error.code,
    );

    throw new Error(
      "Could not load event categories.",
    );
  }

  const rows = (data ?? []) as Array<{
    category: string;
  }>;

  return rows
    .map((row) => row.category)
    .filter(
      (category) =>
        typeof category === "string" &&
        category.trim().length > 0,
    );
}
