/** A student's interests as a row of tags. */
export function InterestTags({ interests }: { interests: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Interests">
      {interests.map((interest) => (
        <li
          key={interest}
          className="rounded-full bg-[var(--maroon-100)] px-3 py-1 text-sm font-medium text-[var(--maroon)] break-all"
        >
          {interest}
        </li>
      ))}
    </ul>
  );
}
