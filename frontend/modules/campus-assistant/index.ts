/**
 * Public API of the campus assistant module. Import from
 * "@/modules/campus-assistant", never from a file inside it.
 *
 * Note: this barrel re-exports server-only code (the provider reads
 * server environment variables), so a Client Component must not import it.
 * Client Components inside the module import their siblings directly.
 */

export { answerQuestion } from "./answer";
export { embedQuerySafely, EmbeddingError, getConfiguredQueryEmbedder, type QueryEmbedder } from "./embeddings";
export { isPersonalQuestion } from "./personal";
export { createRateLimiter } from "./rate-limit";
export { getConfiguredProvider, ProviderError } from "./provider";
export { retrieveEvidence, searchTerms } from "./retrieval";
export { QUESTION_MAX_LENGTH, questionSchema, type AssistantAnswer } from "./schema";
export { loadStudentContext } from "./student-context";

export { AssistantPanel } from "./components/AssistantPanel";
