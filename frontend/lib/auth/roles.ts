export const APP_ROLES = [
  "student",
  "club_representative",
  "moderator",
  "administrator",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const PERMISSIONS = [
  "campus.use",
  "clubs.manage",
  "events.manage",
  "moderation.manage",
  "roles.assign",
  "admin.access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  student: ["campus.use"],
  club_representative: ["campus.use", "clubs.manage", "events.manage"],
  moderator: ["campus.use", "moderation.manage"],
  administrator: [
    "campus.use",
    "clubs.manage",
    "events.manage",
    "moderation.manage",
    "roles.assign",
    "admin.access",
  ],
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLES.includes(value as AppRole);
}

export function hasPermission(role: AppRole | null, permission: Permission) {
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

export function resolveRoleLookup(
  data: { role?: unknown } | null,
  error: { code?: string; message: string } | null,
): AppRole | null {
  // A fresh project may not have SCRUM-16's roles migration yet. Deny role
  // permissions while allowing public pages to render after email verification.
  if (error?.code === "PGRST205" || error?.code === "42P01") return null;
  if (error) throw new Error(`Could not load user role: ${error.message}`);
  return isAppRole(data?.role) ? data.role : null;
}
