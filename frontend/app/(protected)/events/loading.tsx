
export default function EventsLoading() {
  return (
    <main
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
      role="status"
      aria-label="Loading campus events"
    >
      <h1 className="text-3xl font-bold">
        Campus Events
      </h1>

      <p className="mt-3 text-gray-600 dark:text-gray-300">
        Loading events...
      </p>

      <div
        className="mt-8 grid animate-pulse gap-5 sm:grid-cols-2 lg:grid-cols-3"
        aria-hidden="true"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-56 rounded-xl border border-gray-300 p-5 dark:border-gray-700"
          >
            <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-5 h-6 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-5 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-3 h-4 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        ))}
      </div>
    </main>
  );
}
