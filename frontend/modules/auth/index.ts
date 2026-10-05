/**
 * Public API of the auth module. Import from "@/modules/auth", never from a
 * file inside it.
 *
 * Note: `session` is server-only, so a Client Component must not import this
 * barrel. Client Components inside the module import their siblings directly.
 */

export { login, logout, register } from "./actions";
export type {
  LoginFormState,
  RegisterFieldErrors,
  RegisterFormState,
} from "./actions";

export {
  ALREADY_REGISTERED_MESSAGE,
  GENERIC_AUTH_ERROR_MESSAGE,
  isExistingAccount,
  messageForAuthError,
  type AuthErrorLike,
  type SignUpUserLike,
} from "./errors";

export {
  CONFIRM_PATH,
  confirmRedirectUrl,
  DEFAULT_SIGNED_IN_PATH,
  LOGIN_PATH,
  loginPathFor,
  REGISTER_PATH,
  safeNextPath,
} from "./navigation";

export {
  isAcceptablePassword,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_RULES,
  PASSWORD_SYMBOLS,
  passwordProblems,
  type PasswordRule,
} from "./password";

export {
  createLoginSchema,
  createRegisterSchema,
  DEFAULT_ALLOWED_EMAIL_DOMAINS,
  emailDomainMessage,
  loginSchema,
  parseAllowedEmailDomains,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "./schema";

export { getCurrentUser, requireUser, type CurrentUser } from "./session";

export { AuthButtons } from "./components/AuthButtons";
export { LoginForm } from "./components/LoginForm";
export { LogoutButton } from "./components/LogoutButton";
export { PasswordInput } from "./components/PasswordInput";
export { RegisterForm } from "./components/RegisterForm";
