export const tokens = (text: string) => [...new Set(text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) ?? [])];
// Commas separate alternatives; every word inside one group must match.
export function preferenceGroups(entries: string[]) {
  const parsed = entries.flatMap(entry => entry.split(","))
    .map(label => ({ label: label.trim(), words: tokens(label) })).filter(group => group.words.length);
  return [...new Map(parsed.map(group => [[...group.words].sort().join("\0"), group])).values()];
}
