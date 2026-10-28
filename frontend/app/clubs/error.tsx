"use client";
export default function ClubsError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-2xl font-bold">The club directory is unavailable</h1><p className="mt-3 text-gray-600">This is temporary. Your account and filters are safe.</p><button onClick={reset} className="mt-6 rounded-lg bg-[var(--maroon)] px-5 py-2 font-semibold text-white">Try again</button></main>;
}
