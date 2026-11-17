"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FIELD_CLASS, PRIMARY_BUTTON } from "./styles";

/**
 * "Write a post in [community]": picks one of the communities the student
 * can post in and opens its post form.
 */
export function WritePostPicker({ communities }: { communities: readonly { slug: string; name: string }[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState(communities[0]?.slug ?? "");

  if (communities.length === 0) {
    return <p className="text-sm text-[var(--ink-soft)]">Join a community to post in it.</p>;
  }

  function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (slug) router.push(`/communities/${slug}/new`);
  }

  return (
    <form onSubmit={open} aria-label="Write a post" className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-[min(14rem,100%)] flex-1 flex-col gap-1">
        <label htmlFor="write-post-in" className="text-sm font-semibold text-[var(--ink)]">
          Write a post in
        </label>
        <select id="write-post-in" value={slug} onChange={(event) => setSlug(event.target.value)} className={FIELD_CLASS}>
          {communities.map((community) => (
            <option key={community.slug} value={community.slug}>
              {community.name}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className={PRIMARY_BUTTON}>
        Write post
      </button>
    </form>
  );
}
