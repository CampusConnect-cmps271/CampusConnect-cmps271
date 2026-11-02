/**
 * Public API of the campus assistant module. Import from
 * "@/modules/campus-assistant", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code (the provider reads
 * server environment variables), so a Client Component must not import it.
 * Client Components inside the module import their siblings directly.
 */

export { answerQuestion } from "./answer";
export { createRateLimiter } from "./rate-limit";
export { getConfiguredProvider, ProviderError } from "./provider";
export { retrieveEvidence } from "./retrieval";
export { QUESTION_MAX_LENGTH, questionSchema, type AssistantAnswer } from "./schema";

export { AssistantPanel } from "./components/AssistantPanel";
