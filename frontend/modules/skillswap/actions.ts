"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import {
  readSkillSwapForm,
  skillSwapPostIdSchema,
  validateSkillSwapForm,
  type SkillSwapFieldErrors,
  type SkillSwapFormValues,
  type SkillSwapInput,
} from "./schema";

export type SkillSwapFormState =
  | {
      /** What was typed, so a failed save keeps it. */
      values: SkillSwapFormValues;
      errors?: SkillSwapFieldErrors;
      error?: string;
    }
  | undefined;

const CREATE_FAILED = "We couldn't post your skill swap. Please try again.";
const UPDATE_FAILED = "We couldn't save your changes. Please try again.";
const NOT_EDITABLE = "This skill swap can't be edited. It may have been deleted.";

function rpcArguments(input: SkillSwapInput) {
  return {
    can_teach: input.canTeach,
    wants_to_learn: input.wantsToLearn,
    meeting_method: input.meetingMethod,
    availability: input.availability,
    details: input.details,
  };
}

function afterSave(postId: string): never {
  revalidatePath("/skillswap");
  revalidatePath("/home");
  revalidatePath(`/posts/${postId}`);
  redirect(`/posts/${postId}`);
}

/**
 * Creates a SkillSwap post from the template and opens it. The database
 * writes the post and its details in one transaction (create_skillswap_post).
 */
export async function createSkillSwapPost(
  _previous: SkillSwapFormState,
  formData: FormData,
): Promise<SkillSwapFormState> {
  const user = await requireUser();
  const values = readSkillSwapForm(formData);
  const parsed = validateSkillSwapForm(values);

  if (!parsed.success) return { values, errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_skillswap_post", rpcArguments(parsed.data));

  if (error || typeof data !== "string") {
    log.error(
      "skillswap.post.create_failure",
      { code: error?.code ?? "no_id" },
      { userId: user.id },
    );
    return { values, error: CREATE_FAILED };
  }

  log.info("skillswap.post.created", { postId: data }, { userId: user.id });
  afterSave(data);
}

/**
 * Saves the template's changes to one of the student's SkillSwap posts and
 * opens it. Bound to the post's id by the edit page.
 */
export async function updateSkillSwapPost(
  postId: string,
  _previous: SkillSwapFormState,
  formData: FormData,
): Promise<SkillSwapFormState> {
  const user = await requireUser();
  const values = readSkillSwapForm(formData);
  const id = skillSwapPostIdSchema.safeParse(postId);

  if (!id.success) return { values, error: NOT_EDITABLE };

  const parsed = validateSkillSwapForm(values);
  if (!parsed.success) return { values, errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_skillswap_post", {
    post_id: id.data,
    ...rpcArguments(parsed.data),
  });

  // P0002: not the student's published SkillSwap post (RLS hides it).
  if (error?.code === "P0002") {
    log.warn("skillswap.post.update_rejected", { postId: id.data }, { userId: user.id });
    return { values, error: NOT_EDITABLE };
  }

  if (error) {
    log.error(
      "skillswap.post.update_failure",
      { postId: id.data, code: error.code ?? null },
      { userId: user.id },
    );
    return { values, error: UPDATE_FAILED };
  }

  log.info("skillswap.post.updated", { postId: id.data }, { userId: user.id });
  afterSave(id.data);
}
