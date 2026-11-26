"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { checkContentRestrictions } from "@/modules/moderation/restrictions";
import { createClient } from "@/lib/supabase/server";
import { communityErrorMessage, NOT_FOUND_MESSAGE, type CommunityOperation } from "./errors";
import { listCourseCommunities, searchCourses } from "./queries";
import {
  communityIdSchema,
  communitySlugSchema,
  readCommunityForm,
  readCommunityPostForm,
  validateCommunityForm,
  validateCommunityPostForm,
  type CommunityFieldErrors,
  type CommunityFormValues,
  type CommunityPostFieldErrors,
  type CommunityPostFormValues,
} from "./schema";
import type { CommunitySummary, CourseOption } from "./types";

export type CommunityFormState =
  | { values: CommunityFormValues; errors?: CommunityFieldErrors; error?: string }
  | undefined;

export type CommunityPostFormState =
  | { values: CommunityPostFormValues; errors?: CommunityPostFieldErrors; error?: string }
  | undefined;

/** The result of a Join, Leave, Follow, Unfollow or Archive button. */
export type CommunityActionState = { ok: boolean; message?: string } | undefined;

const NOT_EDITABLE = "You can't edit this community. It may have been archived.";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** The community a button acts on: its id, and its address to refresh. */
function target(formData: FormData) {
  const id = communityIdSchema.safeParse(text(formData, "communityId"));
  const slug = communitySlugSchema.safeParse(text(formData, "slug"));
  return { id: id.success ? id.data : null, slug: slug.success ? slug.data : null };
}

function refresh(slug: string | null) {
  revalidatePath("/communities");
  if (slug) revalidatePath(`/communities/${slug}`);
}

/** Runs the content restrictions posts get. Returns the message to show, or null. */
async function restricted(
  userId: string,
  contentType: "community" | "post",
  title: string,
  body: string,
  excludeId?: string,
): Promise<string | null> {
  const result = await checkContentRestrictions({ userId, contentType, title, body, excludeId });
  if (result.allowed) return null;
  log.warn("communities.restricted", { contentType, rule: result.rule }, { userId });
  return result.message;
}

/** Creates a community and opens it. The database adds the owner's membership and follow. */
export async function createCommunity(_previous: CommunityFormState, formData: FormData): Promise<CommunityFormState> {
  const user = await requireUser();
  const values = readCommunityForm(formData);
  const parsed = validateCommunityForm(values);
  if (!parsed.success) return { values, errors: parsed.errors };

  const blocked = await restricted(user.id, "community", parsed.data.name, parsed.data.description ?? "");
  if (blocked) return { values, error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_community", {
      community_name: parsed.data.name,
      community_description: parsed.data.description,
      community_topic: parsed.data.topic,
      community_course_id: parsed.data.courseId,
    })
    .single<{ id: string; slug: string }>();

  if (error || !data) {
    log.warn("communities.create_failure", { code: error?.code ?? "no_row" }, { userId: user.id });
    const message = communityErrorMessage("create", error?.code);
    return error?.code === "23505" ? { values, errors: { name: message } } : { values, error: message };
  }

  log.info("communities.created", { communityId: data.id }, { userId: user.id });
  refresh(data.slug);
  redirect(`/communities/${data.slug}?notice=created`);
}

/** Saves the owner's changes to a community's details. Bound to its id and address. */
export async function updateCommunity(
  communityId: string,
  slug: string,
  _previous: CommunityFormState,
  formData: FormData,
): Promise<CommunityFormState> {
  const user = await requireUser();
  const values = readCommunityForm(formData);
  const id = communityIdSchema.safeParse(communityId);
  const address = communitySlugSchema.safeParse(slug);
  if (!id.success || !address.success) return { values, error: NOT_EDITABLE };

  const parsed = validateCommunityForm(values);
  if (!parsed.success) return { values, errors: parsed.errors };

  const blocked = await restricted(user.id, "community", parsed.data.name, parsed.data.description ?? "", id.data);
  if (blocked) return { values, error: blocked };

  const supabase = await createClient();
  // RLS lets only the owner of an active community change it; anyone else
  // updates nothing.
  const { data, error } = await supabase
    .from("communities")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      topic: parsed.data.topic,
      course_id: parsed.data.courseId,
    })
    .eq("id", id.data)
    .select("id")
    .maybeSingle();

  if (error) {
    log.warn("communities.update_failure", { communityId: id.data, code: error.code ?? null }, { userId: user.id });
    const message = communityErrorMessage("update", error.code);
    return error.code === "23505" ? { values, errors: { name: message } } : { values, error: message };
  }
  if (!data) {
    log.warn("communities.update_rejected", { communityId: id.data }, { userId: user.id });
    return { values, error: NOT_EDITABLE };
  }

  log.info("communities.updated", { communityId: id.data }, { userId: user.id });
  refresh(address.data);
  redirect(`/communities/${address.data}?notice=updated`);
}

async function runButton(
  operation: CommunityOperation,
  event: string,
  formData: FormData,
  act: (supabase: Awaited<ReturnType<typeof createClient>>, communityId: string, userId: string) => PromiseLike<{
    error: { code?: string } | null;
  }>,
): Promise<CommunityActionState> {
  const user = await requireUser();
  const { id, slug } = target(formData);
  if (!id) return { ok: false, message: NOT_FOUND_MESSAGE };

  const supabase = await createClient();
  const { error } = await act(supabase, id, user.id);
  if (error) {
    log.warn(`communities.${operation}_failure`, { communityId: id, code: error.code ?? null }, { userId: user.id });
    refresh(slug);
    return { ok: false, message: communityErrorMessage(operation, error.code) };
  }

  log.info(event, { communityId: id }, { userId: user.id });
  refresh(slug);
  return { ok: true };
}

/** Joins a community, which also follows it. */
export async function joinCommunity(_previous: CommunityActionState, formData: FormData): Promise<CommunityActionState> {
  return runButton("join", "communities.joined", formData, (supabase, communityId) =>
    supabase.rpc("join_community", { target_community_id: communityId }),
  );
}

/** Leaves a community, which also unfollows it. The owner cannot leave. */
export async function leaveCommunity(_previous: CommunityActionState, formData: FormData): Promise<CommunityActionState> {
  return runButton("leave", "communities.left", formData, (supabase, communityId) =>
    supabase.rpc("leave_community", { target_community_id: communityId }),
  );
}

/** Follows a community without joining it. Following twice is fine. */
export async function followCommunity(_previous: CommunityActionState, formData: FormData): Promise<CommunityActionState> {
  return runButton("follow", "communities.followed", formData, async (supabase, communityId, userId) => {
    const { error } = await supabase.from("community_follows").insert({ community_id: communityId, student_id: userId });
    return { error: error?.code === "23505" ? null : error };
  });
}

/** Unfollows a community; a member stays a member. */
export async function unfollowCommunity(_previous: CommunityActionState, formData: FormData): Promise<CommunityActionState> {
  return runButton("unfollow", "communities.unfollowed", formData, async (supabase, communityId, userId) => {
    const { data, error } = await supabase
      .from("community_follows")
      .delete()
      .eq("community_id", communityId)
      .eq("student_id", userId)
      .select("community_id");
    if (error) return { error };
    // Nothing deleted: not following, or the community is archived.
    return { error: data && data.length > 0 ? null : { code: "CM010" } };
  });
}

/** Archives a community, as its owner, a moderator or an administrator. */
export async function archiveCommunity(_previous: CommunityActionState, formData: FormData): Promise<CommunityActionState> {
  return runButton("archive", "communities.archived", formData, (supabase, communityId) =>
    supabase.rpc("archive_community", { target_community_id: communityId }),
  );
}

/** Writes a post in a community and goes back to it. Bound to the community's id and address. */
export async function createCommunityPost(
  communityId: string,
  slug: string,
  _previous: CommunityPostFormState,
  formData: FormData,
): Promise<CommunityPostFormState> {
  const user = await requireUser();
  const values = readCommunityPostForm(formData);
  const id = communityIdSchema.safeParse(communityId);
  const address = communitySlugSchema.safeParse(slug);
  if (!id.success || !address.success) return { values, error: NOT_FOUND_MESSAGE };

  const parsed = validateCommunityPostForm(values);
  if (!parsed.success) return { values, errors: parsed.errors };

  const blocked = await restricted(user.id, "post", parsed.data.title, parsed.data.body);
  if (blocked) return { values, error: blocked };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_community_post", {
    target_community_id: id.data,
    post_title: parsed.data.title,
    post_body: parsed.data.body,
    post_category: parsed.data.category,
  });

  if (error || typeof data !== "string") {
    log.warn("communities.post_create_failure", { communityId: id.data, code: error?.code ?? "no_id" }, { userId: user.id });
    return { values, error: communityErrorMessage("post", error?.code) };
  }

  log.info("communities.post_created", { communityId: id.data, postId: data }, { userId: user.id });
  refresh(address.data);
  revalidatePath("/home");
  redirect(`/communities/${address.data}?notice=posted`);
}

/** Catalogue courses for the course picker. */
export async function findCourses(query: string): Promise<CourseOption[]> {
  await requireUser();
  if (typeof query !== "string") return [];
  try {
    return await searchCourses(query);
  } catch {
    return [];
  }
}

/** The active communities a course already has, for "Join instead?". */
export async function findCourseCommunities(courseId: string): Promise<Pick<CommunitySummary, "id" | "slug" | "name" | "memberCount">[]> {
  await requireUser();
  if (typeof courseId !== "string") return [];
  try {
    const communities = await listCourseCommunities(courseId);
    return communities.map(({ id, slug, name, memberCount }) => ({ id, slug, name, memberCount }));
  } catch {
    return [];
  }
}
