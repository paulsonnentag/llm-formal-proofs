export interface Theorem {
  name: string;
  statement: string;
}

export interface ParsedSpec {
  preamble: string;
  theorems: Theorem[];
}

export function parseSpec(source: string): ParsedSpec {
  // Split on Theorem/Lemma keywords
  const theoremRegex = /^(Theorem|Lemma)\s+(\w+)\s*:/gm;
  const matches = [...source.matchAll(theoremRegex)];

  if (matches.length === 0) {
    return { preamble: source.trimEnd(), theorems: [] };
  }

  // Preamble is everything before the first theorem
  const preamble = source.slice(0, matches[0].index).trimEnd();

  // Each theorem runs from its start to the next theorem (or end of file)
  const theorems: Theorem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = matches[i + 1]?.index ?? source.length;
    const statement = source.slice(start, end).trimEnd();

    theorems.push({
      name: matches[i][2],
      statement,
    });
  }

  return { preamble, theorems };
}

export function assembleProvenFile(preamble: string, provenTheorems: { statement: string; proof: string }[]): string {
  const parts = [preamble];

  for (const t of provenTheorems) {
    parts.push("\n" + t.statement);
    parts.push(t.proof);
  }

  return parts.join("\n").trimEnd() + "\n";
}
