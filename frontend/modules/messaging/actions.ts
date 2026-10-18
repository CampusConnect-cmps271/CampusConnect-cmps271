"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth";
import { log } from "@/modules/logging";
import { createClient } from "@/lib/supabase/server";
import { studentIdSchema } from "./schema";

export type StartConversationState = { error: string } | null;

const CANNOT_MESSAGE = "You can't message this student.";
const START_FAILED = "We couldn't open the conversation. Please try again.";

/**
 * Opens the conversation with another student, creating it the first time,
 * and goes to it. MessageButton binds the student's id; the form's state and
 * data are not needed.
 */
export async function startConversation(
  otherStudentId: string,
): Promise<StartConversationState> {
  const user = await requireUser();
  const parsed = studentIdSchema.safeParse(otherStudentId);

  if (!parsed.success || parsed.data === user.id) return { error: CANNOT_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_conversation", {
    other_user: parsed.data,
  });

  // 22023: yourself; P0002: no such student. Both are the caller's mistake.
  if (error?.code === "22023" || error?.code === "P0002") {
    log.warn(
      "messaging.conversation.rejected",
      { otherStudentId: parsed.data, code: error.code },
      { userId: user.id },
    );
    return { error: CANNOT_MESSAGE };
  }

  if (error || typeof data !== "string") {
    log.error(
      "messaging.conversation.failure",
      { otherStudentId: parsed.data, code: error?.code ?? "no_id" },
      { userId: user.id },
    );
    return { error: START_FAILED };
  }

  log.info(
    "messaging.conversation.started",
    { conversationId: data, otherStudentId: parsed.data },
    { userId: user.id },
  );

  redirect(`/messages/${data}`);
}
