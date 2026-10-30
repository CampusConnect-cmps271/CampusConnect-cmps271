/**
 * How much of what a question should find was found in the first `k` results.
 * `expected` and `results` hold evidence ids: a page chunk id such as
 * "electronic-transcripts:0" or "course:PSYC 212". A question that should find
 * nothing scores 1 when nothing came back and 0 otherwise.
 */
export function recallAtK(results: string[], expected: string[], k: number): number {
  const top = results.slice(0, k);
  if (expected.length === 0) return top.length === 0 ? 1 : 0;
  return expected.filter((id) => top.includes(id)).length / expected.length;
}
