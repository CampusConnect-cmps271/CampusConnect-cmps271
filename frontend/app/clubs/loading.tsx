export default function ClubsLoading() {
  return <main className="mx-auto max-w-6xl animate-pulse px-4 py-10" aria-label="Loading club directory"><div className="h-10 w-64 rounded bg-gray-200" /><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 rounded-xl bg-gray-100" />)}</div></main>;
}
