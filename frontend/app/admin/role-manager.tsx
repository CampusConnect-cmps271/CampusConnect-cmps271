"use client";

import { useMemo, useState } from "react";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";

export type ManagedUser = {
  user_id: string;
  email: string | null;
  role: AppRole;
  updated_at: string;
};

export default function RoleManager({ users: initialUsers }: { users: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      (user.email ?? "").toLowerCase().includes(normalized),
    );
  }, [query, users]);

  async function changeRole(userId: string, role: AppRole) {
    setSavingUserId(userId);
    setMessage("");

    try {
      const response = await fetch("/api/admin/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Could not update role");
      }

      setUsers((current) =>
        current.map((user) =>
          user.user_id === userId ? { ...user, role } : user,
        ),
      );
      setMessage("Role updated successfully.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update role");
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <section className="mt-6">
      <label className="block text-sm font-semibold text-gray-700" htmlFor="user-search">
        Find user by university email
      </label>
      <input
        id="user-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="student@mail.aub.edu"
        className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
      />

      {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-600">
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => (
              <tr key={user.user_id} className="border-b border-gray-100">
                <td className="px-3 py-3 text-gray-900">{user.email ?? user.user_id}</td>
                <td className="px-3 py-3">
                  <select
                    value={user.role}
                    disabled={savingUserId === user.user_id}
                    onChange={(event) =>
                      changeRole(user.user_id, event.target.value as AppRole)
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900"
                  >
                    {APP_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {visibleUsers.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No users found.</p>
        ) : null}
      </div>
    </section>
  );
}
