"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  liftAccountSuspension,
  suspendAccount,
} from "@/modules/moderation/actions";
import type { AppRole } from "@/lib/auth/roles";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)]";
const FIELD = `min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-[var(--ink)] ${FOCUS}`;

export type ManagedAccount = {
  user_id: string;
  email: string | null;
  role: AppRole;
  suspended: boolean;
  suspension_reason: string | null;
  suspended_until: string | null;
};

export default function AccountManager({ accounts }: { accounts: ManagedAccount[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("7d");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const visible = useMemo(() => {
    const value = query.trim().toLowerCase();
    return value
      ? accounts.filter((account) => (account.email ?? "").toLowerCase().includes(value))
      : accounts;
  }, [accounts, query]);

  async function suspend(account: ManagedAccount) {
    setPending(true);
    setMessage(null);
    const result = await suspendAccount({
      userId: account.user_id,
      reason,
      duration,
    });
    setPending(false);
    setMessage({ kind: result.error ? "error" : "success", text: result.error ?? "Account suspended and audit entry recorded." });
    if (!result.error) {
      setReason("");
      setActiveId(null);
      router.refresh();
    }
  }

  async function lift(account: ManagedAccount) {
    setPending(true);
    setMessage(null);
    const result = await liftAccountSuspension({
      userId: account.user_id,
      reason,
    });
    setPending(false);
    setMessage({ kind: result.error ? "error" : "success", text: result.error ?? "Suspension lifted and audit entry recorded." });
    if (!result.error) {
      setReason("");
      setActiveId(null);
      router.refresh();
    }
  }

  return (
    <section className="space-y-4">
      <label className="block text-sm font-semibold" htmlFor="account-search">
        Find account by university email
      </label>
      <input
        id="account-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        placeholder="student@mail.aub.edu"
        className={`w-full ${FIELD}`}
      />
      {message ? <p role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-[var(--danger)]" : "border-emerald-200 bg-emerald-50 text-[var(--success)]"}`}>{message.text}</p> : null}

      <div className="space-y-3">
        {visible.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--maroon-50)] p-8 text-center"><h2 className="font-bold">No matching accounts</h2><p className="mt-2 text-sm text-[var(--ink-soft)]">Check the email spelling or clear the search field.</p></div> : null}
        {visible.map((account) => (
          <article key={account.user_id} className="rounded-xl border border-[var(--border)] p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="font-semibold">{account.email ?? account.user_id}</h2>
                <p className="text-xs capitalize text-[var(--ink-soft)]">{account.role.replaceAll("_", " ")}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${account.suspended ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                {account.suspended ? "Suspended" : "Active"}
              </span>
            </div>

            {account.suspended ? (
              <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-[var(--ink)]">
                {account.suspension_reason}
                {account.suspended_until
                  ? ` · until ${new Date(account.suspended_until).toLocaleString()}`
                  : " · indefinitely"}
              </p>
            ) : null}

            {activeId === account.user_id ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  Reason
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    className={`mt-1 block w-full ${FIELD}`}
                  />
                </label>

                {!account.suspended ? (
                  <label className="block text-sm">
                    Duration
                    <select
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      className={`ml-2 ${FIELD}`}
                    >
                      <option value="1d">1 day</option>
                      <option value="7d">7 days</option>
                      <option value="indefinite">Indefinite</option>
                    </select>
                  </label>
                ) : null}

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={pending || reason.trim().length < 3}
                    onClick={() => account.suspended ? lift(account) : suspend(account)}
                    className={`min-h-11 rounded-lg bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${FOCUS}`}
                  >
                    {pending ? "Saving…" : account.suspended ? "Lift suspension" : "Suspend account"}
                  </button>
                  <button type="button" onClick={() => setActiveId(null)} className={`min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold ${FOCUS}`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setActiveId(account.user_id);
                  setReason("");
                }}
                className={`mt-4 min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--maroon-50)] ${FOCUS}`}
              >
                {account.suspended ? "Review suspension" : "Suspend"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

