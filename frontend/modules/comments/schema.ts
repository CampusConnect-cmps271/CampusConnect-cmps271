import { z } from "zod";

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Please write a comment.")
    .max(2000, "Comments cannot exceed 2000 characters."),
  parentId: z.string().uuid().nullable(),
});

export type CommentInput = z.infer<typeof commentSchema>;
