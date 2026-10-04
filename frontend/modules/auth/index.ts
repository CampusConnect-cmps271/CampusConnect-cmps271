/**
 * Public API of the auth module. Import from "@/modules/auth", never from a
 * file inside it.
 *
 * Note: `session` is server-only, so a Client Component must not import this
 * barrel. Client Components inside the module import their siblings directly.
 */

export { login, logout } from "./actions";
export type { LoginFormState } from "./actions";

export {
  GENERIC_AUTH_ERROR_MESSAGE,
  messageForAuthError,
  type AuthErrorLike,
} from "./errors";

export {
  DEFAULT_SIGNED_IN_PATH,
  LOGIN_PATH,
  loginPathFor,
  safeNextPath,
} from "./navigation";

export {
  createLoginSchema,
  DEFAULT_ALLOWED_EMAIL_DOMAINS,
  emailDomainMessage,
  loginSchema,
  parseAllowedEmailDomains,
  type LoginInput,
} from "./schema";

export { getCurrentUser, requireUser, type CurrentUser } from "./session";

export { AuthButtons } from "./components/AuthButtons";
export { LoginForm } from "./components/LoginForm";
export { LogoutButton } from "./components/LogoutButton";
export { PasswordInput } from "./components/PasswordInput";
