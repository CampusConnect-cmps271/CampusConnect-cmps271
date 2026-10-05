import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAppRole } from "@/lib/auth/roles";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Email verification required" }, { status: 403 });
  }

  const { data: callerRole, error: callerRoleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (callerRoleError) {
    return NextResponse.json({ error: callerRoleError.message }, { status: 500 });
  }

  if (callerRole?.role !== "administrator") {
    return NextResponse.json({ error: "Administrator role required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId =
    typeof body === "object" && body !== null && "userId" in body
      ? (body as { userId?: unknown }).userId
      : undefined;
  const role =
    typeof body === "object" && body !== null && "role" in body
      ? (body as { role?: unknown }).role
      : undefined;

  if (
    typeof userId !== "string" ||
    !UUID_PATTERN.test(userId) ||
    !isAppRole(role)
  ) {
    return NextResponse.json({ error: "Invalid userId or role" }, { status: 400 });
  }

  const { error } = await supabase.rpc("admin_assign_role", {
    target_user_id: userId,
    new_role: role,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true });
}
