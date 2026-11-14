import "server-only";
import { z } from "zod";
const text = z.string().max(20000);
const names = z.array(z.string().max(300)).max(1000);
const section = z.object({
  crn: z.string().max(40), section: z.string().max(40), title: z.string().max(300), credits: z.number().min(0).max(999.99),
  instructors: names, attributes: names, prerequisites: text.nullable(), campus: text,
  details_url: z.string().max(2048).nullable(), source_updated_at: z.string().max(100).nullable(),
  restrictions: z.record(z.string(), z.unknown()).nullable(),
  sessions: z.array(z.object({ days: text, start: text, end: text, type: text, location: text, instructor: text })).max(1000),
});
export const candidateCatalogueSchema = z.object({
  truncated: z.literal(false), catalogueCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  courses: z.array(z.object({
    id: z.string().min(1).max(64), code: z.string().max(32), name: z.string().max(300), description: text,
    department: z.string().max(200), prerequisites: text, credits: z.number().min(0).max(999.99),
    review_count: z.number().int().nonnegative().nullable(), average_workload: z.number().min(0).max(5).nullable(), average_overall: z.number().min(0).max(5).nullable(),
    offering: z.object({ semester_id: z.string().regex(/^\d{6}$/), semester_name: z.string().max(100), synced_at: z.string().max(100), sections: z.array(section).max(50000) }).optional(),
  })).max(100000),
}).refine(value => value.courses.length <= value.catalogueCount);
export const candidateEnvelopeSchema = z.object({ version: z.literal(1), key: z.string().max(256), expiresAt: z.number().int().positive(), value: candidateCatalogueSchema });
