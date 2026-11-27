import { z } from "zod";

/** Counts are private display data; never use them as authorization claims. */
export const headerCountsSchema = z.object({
  messages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  notifications: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type HeaderCounts = z.infer<typeof headerCountsSchema>;
