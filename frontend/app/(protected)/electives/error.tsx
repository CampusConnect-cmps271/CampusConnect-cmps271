"use client";
export default function Error({ reset }: { reset: () => void }) {
  return <main className="p-8"><h1>Electives are temporarily unavailable</h1><p>Please try again in a moment.</p><button onClick={reset}>Try again</button></main>;
}
