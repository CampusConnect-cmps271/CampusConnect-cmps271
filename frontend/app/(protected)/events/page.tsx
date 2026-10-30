
import Link from "next/link";

import {
  listPublishedEvents,
  listPublishedEventCategories,
  type EventSummary,
} from "@/modules/events/discovery";

type SearchParams = {
  category?: string | string[];
  startDate?: string | string[];
  endDate?: string | string[];
  includePast?: string | string[];
  page?: string | string[];
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

function getValue(
  value: string | string[] | undefined,
): string {
  return typeof value === "string" ? value : "";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Beirut",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getPageNumber(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    return 1;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : 1;
}

function makePageUrl(
  params: {
    category: string;
    startDate: string;
    endDate: string;
    includePast: boolean;
  },
  page: number,
) {
  const query = new URLSearchParams();

  if (params.category) {
    query.set("category", params.category);
  }

  if (params.startDate) {
    query.set("startDate", params.startDate);
  }

  if (params.endDate) {
    query.set("endDate", params.endDate);
  }

  if (params.includePast) {
    query.set("includePast", "true");
  }

  if (page > 1) {
    query.set("page", String(page));
  }

  const suffix = query.toString();

  return suffix ? `/events?${suffix}` : "/events";
}

function EventCard({ event }: { event: EventSummary }) {
  return (
    <article className="flex h-full flex-col justify-between rounded-xl border border-gray-300 p-5 dark:border-gray-700">
      <div>
        <p className="mb-3 text-sm font-medium text-blue-600 dark:text-blue-400">
          {event.category}
        </p>

        <h2 className="text-xl font-semibold">
          <Link
            href={`/events/${event.id}`}
            className="hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
          >
            {event.title}
          </Link>
        </h2>

        <dl className="mt-4 space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Starts</dt>
            <dd className="text-gray-600 dark:text-gray-300">
              {formatDate(event.starts_at)}
            </dd>
          </div>

          <div>
            <dt className="font-semibold">Ends</dt>
            <dd className="text-gray-600 dark:text-gray-300">
              {formatDate(event.ends_at)}
            </dd>
          </div>

          <div>
            <dt className="font-semibold">Location</dt>
            <dd className="text-gray-600 dark:text-gray-300">
              {event.location}
            </dd>
          </div>
        </dl>

        <p className="mt-4 line-clamp-3 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
          {event.description ||
            "No additional description available."}
        </p>
      </div>

      <Link
        href={`/events/${event.id}`}
        className="mt-6 inline-flex w-fit items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-blue-400 dark:hover:bg-gray-800"
        aria-label={`View details for ${event.title}`}
      >
        View Details
      </Link>
    </article>
  );
}

export default async function EventsPage({
  searchParams,
}: PageProps) {
  const search = await searchParams;

  const category = getValue(search.category).trim();
  const startDate = getValue(search.startDate);
  const endDate = getValue(search.endDate);
  const includePast =
    getValue(search.includePast) === "true";
  const page = getPageNumber(getValue(search.page));

  let result: Awaited<
    ReturnType<typeof listPublishedEvents>
  > | null = null;

  let categories: string[] = [];
  let errorMessage = "";

  try {
    [result, categories] = await Promise.all([
      listPublishedEvents({
        category: category || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        includePast,
        page,
      }),
      listPublishedEventCategories(),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Could not load events.";
  }

  // Preserve an existing URL category even if no
  // currently published event uses it.
  const categoryOptions =
    category && !categories.includes(category)
      ? [category, ...categories]
      : categories;

  const currentFilters = {
    category,
    startDate,
    endDate,
    includePast,
  };

  const activeFilters =
    Boolean(category) ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    includePast;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">
          Campus Events
        </h1>

        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Discover workshops, activities, and events
          happening around campus.
        </p>

        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          All dates and times are shown in Beirut time.
        </p>
      </header>

      <section
        aria-labelledby="event-filters-heading"
        className="mb-8 rounded-xl border border-gray-300 p-5 dark:border-gray-700"
      >
        <h2
          id="event-filters-heading"
          className="text-lg font-semibold"
        >
          Filter Events
        </h2>

        <form
          method="get"
          action="/events"
          className="mt-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label
                htmlFor="event-category"
                className="block text-sm font-medium"
              >
                Category
              </label>

              <select
                id="event-category"
                name="category"
                defaultValue={category}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600"
              >
                <option value="">
                  All Categories
                </option>

                {categoryOptions.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="event-start-date"
                className="block text-sm font-medium"
              >
                From Date
              </label>

              <input
                id="event-start-date"
                name="startDate"
                type="date"
                defaultValue={startDate}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600"
              />
            </div>

            <div>
              <label
                htmlFor="event-end-date"
                className="block text-sm font-medium"
              >
                To Date
              </label>

              <input
                id="event-end-date"
                name="endDate"
                type="date"
                min={startDate || undefined}
                defaultValue={endDate}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600"
              />
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="includePast"
              value="true"
              defaultChecked={includePast}
              className="h-4 w-4"
            />
            Include past events
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Apply Filters
            </button>

            <Link
              href="/events"
              className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-gray-600 dark:hover:bg-gray-800"
            >
              Clear Filters
            </Link>
          </div>
        </form>
      </section>

      {errorMessage ? (
        <section
          role="alert"
          className="rounded-xl border border-red-300 p-6"
        >
          <h2 className="text-lg font-semibold">
            Unable to load events
          </h2>

          <p className="mt-2 text-sm">
            {errorMessage}
          </p>

          <Link
            href="/events"
            className="mt-4 inline-block font-medium text-blue-600 underline dark:text-blue-400"
          >
            Return to all events
          </Link>
        </section>
      ) : result && result.events.length === 0 ? (
        <section
          aria-live="polite"
          className="rounded-xl border border-gray-300 p-10 text-center dark:border-gray-700"
        >
          <h2 className="text-xl font-semibold">
            No events found
          </h2>

          <p className="mt-3 text-gray-600 dark:text-gray-300">
            {page > 1
              ? "There are no events on this page."
              : activeFilters
                ? "No events match your current filters."
                : "There are no upcoming published events."}
          </p>

          <Link
            href="/events"
            className="mt-5 inline-block font-medium text-blue-600 underline dark:text-blue-400"
          >
            View all upcoming events
          </Link>
        </section>
      ) : result ? (
        <section aria-labelledby="event-results-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="event-results-heading"
              className="text-xl font-semibold"
            >
              Available Events
            </h2>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Page {result.page}
              {result.hasMore
                ? " · More events available"
                : ""}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
              />
            ))}
          </div>

          <nav
            aria-label="Event pages"
            className="mt-8 flex items-center justify-between gap-4"
          >
            {page > 1 ? (
              <Link
                href={makePageUrl(
                  currentFilters,
                  page - 1,
                )}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                Previous
              </Link>
            ) : (
              <span />
            )}

            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {page}
            </span>

            {result.hasMore ? (
              <Link
                href={makePageUrl(
                  currentFilters,
                  result.nextPage ?? page + 1,
                )}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </section>
      ) : null}
    </main>
  );
}
