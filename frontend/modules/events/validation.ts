
export const EVENT_TIMEZONE = "Asia/Beirut";

export type EventField =
  | "title"
  | "description"
  | "startsAt"
  | "endsAt"
  | "location"
  | "category"
  | "registrationUrl"
  | "clubName";

export type EventFormValues = Record<EventField, string>;

export type EventFormErrors = Partial<
  Record<EventField, string>
>;

export type EventActionState = {
  success: boolean;
  message: string;
  errors: EventFormErrors;
};

export const initialEventState: EventActionState = {
  success: false,
  message: "",
  errors: {},
};

export const EVENT_CATEGORIES = [
  "Academics",
  "Campus Life",
  "Housing",
  "Clubs & Events",
  "General",
] as const;

export function getEventValues(
  formData: FormData,
): EventFormValues {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };

  return {
    title: read("title"),
    description: read("description"),
    startsAt: read("startsAt"),
    endsAt: read("endsAt"),
    location: read("location"),
    category: read("category"),
    registrationUrl: read("registrationUrl"),
    clubName: read("clubName"),
  };
}

function getBeirutParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

export function beirutLocalToIso(
  localValue: string,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(
    localValue,
  );

  if (!match) return null;

  const [, y, mo, d, h, mi] = match;

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const target = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
  );

  const dateCheck = new Date(target);

  if (
    dateCheck.getUTCFullYear() !== year ||
    dateCheck.getUTCMonth() + 1 !== month ||
    dateCheck.getUTCDate() !== day
  ) {
    return null;
  }

  // Check possible UTC offsets for Beirut, including DST.
  // Round-trip verification rejects nonexistent local times.
  const matches: number[] = [];

  for (let offsetMinutes = 120; offsetMinutes <= 180; offsetMinutes += 60) {
    const candidate = target - offsetMinutes * 60_000;
    const parts = getBeirutParts(new Date(candidate));

    if (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      matches.push(candidate);
    }
  }

  if (matches.length !== 1) return null;

  return new Date(matches[0]).toISOString();
}

export function validateEvent(
  values: EventFormValues,
  mode: "draft" | "published",
) {
  const errors: EventFormErrors = {};

  if (!values.title) {
    errors.title = "Enter an event title.";
  } else if (values.title.length > 200) {
    errors.title = "Title must be 200 characters or fewer.";
  }

  if (values.description.length > 10000) {
    errors.description =
      "Description must be 10,000 characters or fewer.";
  } else if (mode === "published" && !values.description) {
    errors.description = "Enter an event description.";
  }

  if (!values.location) {
    errors.location = "Enter an event location.";
  } else if (values.location.length > 300) {
    errors.location =
      "Location must be 300 characters or fewer.";
  }

  if (!values.category) {
    errors.category = "Select an event category.";
  } else if (values.category.length > 100) {
    errors.category =
      "Category must be 100 characters or fewer.";
  }

  if (values.clubName.length > 150) {
    errors.clubName =
      "Club name must be 150 characters or fewer.";
  }

  let startsAt: string | null = null;
  let endsAt: string | null = null;

  if (!values.startsAt) {
    errors.startsAt = "Select a start date and time.";
  } else {
    startsAt = beirutLocalToIso(values.startsAt);

    if (!startsAt) {
      errors.startsAt =
        "Enter a valid, unambiguous Beirut date and time.";
    }
  }

  if (!values.endsAt) {
    errors.endsAt = "Select an end date and time.";
  } else {
    endsAt = beirutLocalToIso(values.endsAt);

    if (!endsAt) {
      errors.endsAt =
        "Enter a valid, unambiguous Beirut date and time.";
    }
  }

  if (
    startsAt &&
    endsAt &&
    new Date(endsAt).getTime() <=
      new Date(startsAt).getTime()
  ) {
    errors.endsAt =
      "The end time must be after the start time.";
  }

  if (values.registrationUrl) {
    try {
      const url = new URL(values.registrationUrl);

      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        /\s/.test(values.registrationUrl) ||
        values.registrationUrl.length > 2048
      ) {
        throw new Error("Invalid URL");
      }
    } catch {
      errors.registrationUrl =
        "Enter a valid HTTPS registration URL.";
    }
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    startsAt,
    endsAt,
  };
}
