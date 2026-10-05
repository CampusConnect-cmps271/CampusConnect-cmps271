import * as z from "zod";
import { passwordProblems } from "./password";

/** Used when NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS is unset or empty. */
export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["mail.aub.edu"];

/**
 * Reads the comma-separated allow-list of university email domains. A leading
 * "@" on an entry is tolerated so the variable is forgiving to edit by hand.
 */
export function parseAllowedEmailDomains(
  raw: string | undefined = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS,
): string[] {
  const domains = (raw ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter((domain) => domain.length > 0);

  return domains.length > 0 ? domains : [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
}

/** Built once, not per submission. */
const EMAIL_FORMAT = z.email();

export function emailDomainMessage(domains: string[]): string {
  const list = domains.map((domain) => `@${domain}`).join(" or ");
  return `Use your university email (${list})`;
}

/**
 * University email field, shared by login and registration so the two can
 * never disagree about what counts as a valid address.
 *
 * Reports one message per failure and stops, rather than stacking "required",
 * "not an email" and "wrong domain" on an empty field.
 */
function universityEmailField(domains: string[]) {
  return z
    .string({ error: "Email is required" })
    .transform((value) => value.trim().toLowerCase())
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        ctx.addIssue({ code: "custom", message: "Email is required" });
        return;
      }

      if (!EMAIL_FORMAT.safeParse(value).success) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid email address",
        });
        return;
      }

      const domain = value.slice(value.lastIndexOf("@") + 1);
      if (!domains.includes(domain)) {
        ctx.addIssue({ code: "custom", message: emailDomainMessage(domains) });
      }
    });
}

/**
 * Login form schema.
 *
 * Password rules are deliberately not enforced here; an existing account may
 * predate a policy change, and the server is the judge of its credentials.
 */
export function createLoginSchema(
  domains: string[] = parseAllowedEmailDomains(),
) {
  return z.object({
    email: universityEmailField(domains),
    password: z
      .string({ error: "Password is required" })
      .min(1, { error: "Password is required" }),
  });
}

export const loginSchema = createLoginSchema();

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;

/**
 * Registration form schema. Unlike login, this does enforce the password
 * policy, so the student is told what is wrong before the server rejects it.
 */
export function createRegisterSchema(
  domains: string[] = parseAllowedEmailDomains(),
) {
  return z
    .object({
      fullName: z
        .string({ error: "Name is required" })
        .transform((value) => value.trim().replace(/\s+/g, " "))
        .superRefine((value, ctx) => {
          if (value.length === 0) {
            ctx.addIssue({ code: "custom", message: "Name is required" });
            return;
          }

          if (value.length < 2) {
            ctx.addIssue({
              code: "custom",
              message: "Name must be at least 2 characters long",
            });
          }
        }),
      email: universityEmailField(domains),
      password: z
        .string({ error: "Password is required" })
        .superRefine((value, ctx) => {
          if (value.length === 0) {
            ctx.addIssue({ code: "custom", message: "Password is required" });
            return;
          }

          // One issue per unmet rule, so the form can list them all.
          for (const problem of passwordProblems(value)) {
            ctx.addIssue({ code: "custom", message: problem });
          }
        }),
      confirmPassword: z
        .string({ error: "Confirm your password" })
        .min(1, { error: "Confirm your password" }),
    })
    .superRefine((values, ctx) => {
      // Only worth saying once the confirmation field has something in it.
      if (
        values.confirmPassword.length > 0 &&
        values.password !== values.confirmPassword
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Passwords do not match",
          path: ["confirmPassword"],
        });
      }
    });
}

export const registerSchema = createRegisterSchema();

export type RegisterInput = z.infer<ReturnType<typeof createRegisterSchema>>;
