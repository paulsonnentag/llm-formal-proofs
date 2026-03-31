export interface Theorem {
  name: string;
  statement: string;  // e.g., "theorem foo : Nat -> Nat"
}

export interface ParsedSpec {
  preamble: string;
  theorems: Theorem[];
}

export function parseSpec(source: string): ParsedSpec {
  // Match theorem/lemma declarations (without := proof)
  // Format: theorem name : type (possibly multiline until next theorem or :=)
  const theoremRegex = /^(theorem|lemma)\s+(\w+)\s*:/gm;
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
    // Add ":= by" and the proof tactics
    parts.push("\n" + t.statement + " := by");
    // Indent the proof
    const indentedProof = t.proof
      .split("\n")
      .map((l) => (l.trim() ? "  " + l : l))
      .join("\n");
    parts.push(indentedProof);
  }

  return parts.join("\n").trimEnd() + "\n";
}
