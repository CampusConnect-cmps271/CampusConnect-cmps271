"use client";

import { useFormStatus } from "react-dom";
import { logout } from "../actions";

type LogoutButtonProps = {
  className?: string;
};

function SubmitButton({ className }: LogoutButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:hover:bg-white/10"
      }
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <form action={logout}>
      <SubmitButton className={className} />
    </form>
  );
}
