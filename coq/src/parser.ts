export interface Theorem {
  name: string;
  statement: string;
}

export interface ParsedSpec {
  preamble: string;
  theorems: Theorem[];
}

export function parseSpec(source: string): ParsedSpec {
  // Match Theorem/Lemma declarations without a Proof block
  // Format: Theorem name : type. (or Lemma)
  // We look for declarations that don't have "Proof." following them
  const theoremRegex = /^(Theorem|Lemma)\s+(\w+)\s*:/gm;
  const matches = [...source.matchAll(theoremRegex)];

  if (matches.length === 0) {
    return { preamble: source.trimEnd(), theorems: [] };
  }

  // Preamble is everything before the first theorem
  const preamble = source.slice(0, matches[0].index).trimEnd();

  const theorems: Theorem[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = matches[i + 1]?.index ?? source.length;
    let statement = source.slice(start, end).trimEnd();

    // Check if this theorem already has a proof (skip it if so)
    if (statement.includes("Proof.") || statement.includes("Admitted.")) {
      continue;
    }

    // Remove trailing period if present (we'll add it back in assembly)
    if (statement.endsWith(".")) {
      statement = statement.slice(0, -1).trimEnd();
    }

    theorems.push({
      name: matches[i][2],
      statement,
    });
  }

  return { preamble, theorems };
}

export function assembleProvenFile(
  preamble: string,
  provenTheorems: { statement: string; proof: string }[]
): string {
  const parts = [preamble];

  for (const t of provenTheorems) {
    // Coq format: statement. Proof. tactics. Qed.
    parts.push(`\n${t.statement}.`);
    parts.push("Proof.");
    parts.push(t.proof);
    parts.push("Qed.");
  }

  return parts.join("\n").trimEnd() + "\n";
}
