import { ProviderError, type AnswerProvider } from "./provider";
import { searchTerms } from "./retrieval";
import {
  isCitableUrl,
  providerAnswerSchema,
  type AssistantAnswer,
  type EvidenceChunk,
  type HistoryTurn,
} from "./schema";

export const INSUFFICIENT_ANSWER: AssistantAnswer = {
  answer:
    "I couldn't find this in the official AUB pages I have. Please check the relevant AUB office or website. لم أجد هذه المعلومة في صفحات الجامعة الرسمية المتاحة لي.",
  citations: [],
  insufficient_evidence: true,
};

/** Models sometimes wrap JSON in a code fence or a sentence; take the outermost object. */
function parseProviderJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Answers a question from retrieved evidence.
 *
 * With no evidence the provider is never called. Whatever it returns is
 * validated: citations are rebuilt from the stored chunks (so a made-up id,
 * URL or title cannot reach the student), and an answer that cites nothing
 * retrieved is replaced by the no-evidence answer rather than shown unsupported.
 *
 * A vague follow-up ("and how long does it take?") has too little to search on,
 * so the previous question is searched along with it; a specific question (three
 * topic words, or a course code) is not, or the old topic would crowd out the new one. Earlier turns go to the provider
 * as context only: evidence still comes solely from retrieval, so history cannot
 * add a citable source.
 */
export async function answerQuestion(
  question: string,
  retrieve: (question: string) => Promise<EvidenceChunk[]>,
  provider: AnswerProvider,
  history: HistoryTurn[] = [],
): Promise<AssistantAnswer> {
  const terms = searchTerms(question);
  const isVague = terms.length < 3 && !terms.some((term) => /\d/.test(term));
  const evidence = await retrieve(isVague && history.length > 0 ? `${question} ${history.at(-1)?.question}` : question);
  if (evidence.length === 0) return INSUFFICIENT_ANSWER;

  const parsed = providerAnswerSchema.safeParse(parseProviderJson(await provider({ question, evidence, history })));
  if (!parsed.success) throw new ProviderError("invalid_response");
  if (parsed.data.insufficient_evidence || parsed.data.answer === "") return INSUFFICIENT_ANSWER;

  const byId = new Map(evidence.map((chunk) => [chunk.chunk_id, chunk]));
  const cited = [...new Set(parsed.data.citation_chunk_ids)]
    .flatMap((id) => byId.get(id) ?? [])
    .filter((chunk) => isCitableUrl(chunk.url));
  if (cited.length === 0) return INSUFFICIENT_ANSWER;

  return {
    answer: parsed.data.answer,
    citations: cited.map(({ source_id, chunk_id, url, title, retrieved_at }) => ({ source_id, chunk_id, url, title, retrieved_at })),
    insufficient_evidence: false,
  };
}
