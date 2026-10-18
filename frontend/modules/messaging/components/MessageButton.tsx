import { requireUser } from "@/modules/auth";
import { startConversation } from "../actions";
import { MessageButtonForm } from "./MessageButtonForm";

type MessageButtonProps = {
  studentId: string;
  /** Read by screen readers after "Message", so the button names who. */
  studentName: string;
};

/**
 * "Message" for another student's profile or post: opens the conversation
 * with them, creating it the first time. Renders nothing for your own.
 */
export async function MessageButton({ studentId, studentName }: MessageButtonProps) {
  const user = await requireUser();
  if (studentId.toLowerCase() === user.id) return null;

  return (
    <MessageButtonForm
      action={startConversation.bind(null, studentId)}
      studentName={studentName}
    />
  );
}
