
import { z } from "zod";

export const postSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Please enter a title.")
    .max(200, "Title cannot exceed 200 characters."),

  body: z
    .string()
    .trim()
    .min(1, "Please enter post content.")
    .max(10000, "Content cannot exceed 10000 characters."),

  category: z.enum(
    [
      "Academics",
      "Campus Life",
      "Housing",
      "Clubs & Events",
      "General",
    ],
    { error: "Please select a valid category." }
  ),
});

export type PostInput = z.infer<typeof postSchema>;
