export type ErrorLogRow = {
  id: string;
  created_at: string;
  source: "server" | "client";
  event: string;
  message: string | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
};

export type ErrorGroup = {
  key: string;
  event: string;
  source: ErrorLogRow["source"];
  count: number;
  lastSeen: string;
  affectedAccounts: number;
  sampleMessage: string | null;
  samplePath: string | null;
};

function contextPath(context: ErrorLogRow["context"]): string | null {
  if (!context) return null;
  for (const key of ["page", "path", "route"]) {
    if (typeof context[key] === "string") return context[key];
  }
  return null;
}

export function groupErrorLogs(rows: readonly ErrorLogRow[]): ErrorGroup[] {
  const groups = new Map<
    string,
    ErrorGroup & { accountIds: Set<string> }
  >();

  for (const row of rows) {
    const key = `${row.source}:${row.event}`;
    const group = groups.get(key);

    if (group) {
      group.count += 1;
      if (row.created_at > group.lastSeen) group.lastSeen = row.created_at;
      if (row.user_id) group.accountIds.add(row.user_id);
      continue;
    }

    groups.set(key, {
      key,
      event: row.event,
      source: row.source,
      count: 1,
      lastSeen: row.created_at,
      affectedAccounts: 0,
      sampleMessage: row.message,
      samplePath: contextPath(row.context),
      accountIds: new Set(row.user_id ? [row.user_id] : []),
    });
  }

  return [...groups.values()]
    .map(({ accountIds, ...group }) => ({
      ...group,
      affectedAccounts: accountIds.size,
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
