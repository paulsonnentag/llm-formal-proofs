import { readFileSync, writeFileSync } from "fs";
import { generateProof } from "./llm";
import { check } from "./coqcheck";
import { parseSpec, assembleProvenFile, Theorem } from "./parser";

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let specFile = "";
  let apiKey = process.env.OPENROUTER_API_KEY || "";
  let model = "anthropic/claude-opus-4.6";
  let maxRetries = 5;
  let output = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--key":
        apiKey = args[++i];
        break;
      case "--model":
        model = args[++i];
        break;
      case "--max-retries":
        maxRetries = parseInt(args[++i], 10);
        break;
      case "--output":
        output = args[++i];
        break;
      default:
        if (!args[i].startsWith("--")) specFile = args[i];
    }
  }

  if (!specFile) {
    log("Usage: ts-node src/index.ts <spec.v> [--key KEY] [--model MODEL] [--max-retries N] [--output FILE]");
    process.exit(1);
  }
  if (!apiKey) {
    log("Error: API key required. Pass --key or set OPENROUTER_API_KEY.");
    process.exit(1);
  }

  return { specFile, apiKey, model, maxRetries, output };
}

interface ProofResult {
  theorem: Theorem;
  proof: string | null;
  attempts: number;
  error?: string;
}

async function proveTheorem(
  preamble: string,
  theorem: Theorem,
  opts: { apiKey: string; model: string; maxRetries: number }
): Promise<ProofResult> {
  const history: { attempt: string; errors: string }[] = [];

  for (let attempt = 1; attempt <= opts.maxRetries; attempt++) {
    log(`  [${theorem.name}] Attempt ${attempt}...`);

    let proof: string;
    try {
      proof = await generateProof(preamble, theorem.statement, history, {
        apiKey: opts.apiKey,
        model: opts.model,
      });
    } catch (err) {
      log(`  [${theorem.name}] LLM error: ${(err as Error).message}`);
      continue;
    }

    // Build a complete file to check: preamble + theorem + proof
    const fullFile = `${preamble}\n\n${theorem.statement}\n${proof}\n`;
    const { success, errors } = check(fullFile);

    if (success) {
      log(`  [${theorem.name}] OK (attempt ${attempt})`);
      return { theorem, proof, attempts: attempt };
    }

    log(`  [${theorem.name}] FAIL`);
    history.push({ attempt: proof, errors });
  }

  return {
    theorem,
    proof: null,
    attempts: opts.maxRetries,
    error: `Failed after ${opts.maxRetries} attempts`,
  };
}

async function main() {
  const { specFile, apiKey, model, maxRetries, output } = parseArgs(process.argv);

  log(`Reading ${specFile} ...`);
  const source = readFileSync(specFile, "utf-8");

  const { preamble, theorems } = parseSpec(source);

  log(`Model: ${model}`);
  log(`Max retries: ${maxRetries}`);
  log(`Found ${theorems.length} theorem(s): ${theorems.map((t) => t.name).join(", ")}\n`);

  if (theorems.length === 0) {
    log("No theorems found in spec.");
    process.exit(1);
  }

  // Prove all theorems in parallel
  log("Proving theorems in parallel...\n");
  const results = await Promise.all(
    theorems.map((theorem) => proveTheorem(preamble, theorem, { apiKey, model, maxRetries }))
  );

  // Check results
  const succeeded = results.filter((r) => r.proof !== null);
  const failed = results.filter((r) => r.proof === null);

  log(`\n--- Summary ---`);
  log(`Proved: ${succeeded.length}/${theorems.length}`);

  if (failed.length > 0) {
    log(`Failed: ${failed.map((r) => r.theorem.name).join(", ")}`);
  }

  if (succeeded.length === 0) {
    log("\nNo theorems were proven.");
    process.exit(1);
  }

  // Assemble proven file (only include successful proofs)
  const provenTheorems = results
    .filter((r): r is ProofResult & { proof: string } => r.proof !== null)
    .map((r) => ({ statement: r.theorem.statement, proof: r.proof }));

  const proven = assembleProvenFile(preamble, provenTheorems);

  if (output) {
    writeFileSync(output, proven, "utf-8");
    log(`\nWrote ${output}`);
  } else {
    process.stdout.write(proven + "\n");
  }

  if (failed.length > 0) {
    process.exit(1); // partial success
  }
}

main().catch((err) => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
