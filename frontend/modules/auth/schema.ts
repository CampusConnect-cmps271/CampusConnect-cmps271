import * as z from "zod";

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

export function emailDomainMessage(domains: string[]): string {
  const list = domains.map((domain) => `@${domain}`).join(" or ");
  return `Use your university email (${list})`;
}

/**
 * Login form schema. One schema is shared by the form and the Server Action so
 * the browser and the server never disagree about what is valid.
 *
 * Only the email is checked against the domain allow-list; password rules
 * belong to registration, since an existing account may predate a policy change.
 */
export function createLoginSchema(
  domains: string[] = parseAllowedEmailDomains(),
) {
  return z.object({
    email: z
      .string({ error: "Email is required" })
      .transform((value) => value.trim().toLowerCase())
      .superRefine((value, ctx) => {
        if (value.length === 0) {
          ctx.addIssue({ code: "custom", message: "Email is required" });
          return;
        }

        if (!z.email().safeParse(value).success) {
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
      }),
    password: z
      .string({ error: "Password is required" })
      .min(1, { error: "Password is required" }),
  });
}

export const loginSchema = createLoginSchema();

export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
