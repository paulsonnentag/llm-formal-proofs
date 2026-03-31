import { readFileSync, writeFileSync } from "fs";
import { generateProof, chatWithTools, getAgenticTools, Message, SYSTEM_PROMPT_AGENTIC } from "./llm";
import { check } from "./leancheck-wasm";
import { parseSpec, assembleProvenFile, Theorem } from "./parser";
import { executeToolCall, ProofState } from "./tools";

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let specFile = "";
  let apiKey = process.env.OPENROUTER_API_KEY || "";
  let model = "anthropic/claude-opus-4.6";
  let maxRetries = 5;
  let maxIterations = 20;
  let output = "";
  let agentic = false;

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
      case "--max-iterations":
        maxIterations = parseInt(args[++i], 10);
        break;
      case "--output":
        output = args[++i];
        break;
      case "--agentic":
        agentic = true;
        break;
      default:
        if (!args[i].startsWith("--")) specFile = args[i];
    }
  }

  if (!specFile) {
    log("Usage: ts-node src/index.ts <spec.lean> [--key KEY] [--model MODEL] [--max-retries N] [--max-iterations N] [--output FILE] [--agentic]");
    process.exit(1);
  }
  if (!apiKey) {
    log("Error: API key required. Pass --key or set OPENROUTER_API_KEY.");
    process.exit(1);
  }

  return { specFile, apiKey, model, maxRetries, maxIterations, output, agentic };
}

interface ProofResult {
  theorem: Theorem;
  proof: string | null;
  attempts: number;
  toolCalls?: number;
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

    // Build a complete file to check: preamble + theorem + := by + proof
    const indentedProof = proof
      .split("\n")
      .map((l) => (l.trim() ? "  " + l : l))
      .join("\n");
    const fullFile = `${preamble}\n\n${theorem.statement} := by\n${indentedProof}\n`;
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

async function proveTheoremAgentic(
  preamble: string,
  theorem: Theorem,
  opts: { apiKey: string; model: string; maxIterations: number }
): Promise<ProofResult> {
  const tools = getAgenticTools();
  const state: ProofState = {
    tactics: "",
    preamble,
    theoremStatement: theorem.statement,
  };

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT_AGENTIC },
    {
      role: "user",
      content: `Prove this theorem:\n\n${preamble}\n\n${theorem.statement}\n\nStart by using replace_all to write your initial proof attempt, then use check_proof to verify it. Iterate until successful, then call submit.`,
    },
  ];

  let iterations = 0;
  let totalToolCalls = 0;

  while (iterations < opts.maxIterations) {
    iterations++;
    log(`  [${theorem.name}] Iteration ${iterations}...`);

    let response;
    try {
      response = await chatWithTools(messages, { apiKey: opts.apiKey, model: opts.model }, tools, 0);
    } catch (err) {
      log(`  [${theorem.name}] LLM error: ${(err as Error).message}`);
      continue;
    }

    // If the model responded with text (no tool calls), add it to messages
    if (response.content) {
      log(`  [${theorem.name}] Model: ${response.content.slice(0, 100)}...`);
      messages.push({ role: "assistant", content: response.content });
    }

    // Process tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.toolCalls,
      });

      for (const toolCall of response.toolCalls) {
        totalToolCalls++;
        const toolName = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          args = {};
        }

        log(`  [${theorem.name}] Tool: ${toolName}(${JSON.stringify(args).slice(0, 50)}...)`);

        const result = executeToolCall(toolName, args, state);

        // Update state if tactics changed
        if (result.updatedTactics !== undefined) {
          state.tactics = result.updatedTactics;
        }

        // Add tool result to messages
        messages.push({
          role: "tool",
          content: result.output,
          tool_call_id: toolCall.id,
        });

        // Check if proof was submitted successfully
        if (result.proofSubmitted) {
          log(`  [${theorem.name}] OK (${iterations} iterations, ${totalToolCalls} tool calls)`);
          return {
            theorem,
            proof: state.tactics,
            attempts: iterations,
            toolCalls: totalToolCalls,
          };
        }
      }
    }

    // If no tool calls and finish_reason is "stop", the model gave up
    if (!response.toolCalls && response.finishReason === "stop") {
      log(`  [${theorem.name}] Model stopped without submitting`);
      // Prompt to continue
      messages.push({
        role: "user",
        content: "Please continue working on the proof. Use the tools to check and fix issues, then submit when ready.",
      });
    }
  }

  return {
    theorem,
    proof: null,
    attempts: iterations,
    toolCalls: totalToolCalls,
    error: `Failed after ${opts.maxIterations} iterations`,
  };
}

async function main() {
  const { specFile, apiKey, model, maxRetries, maxIterations, output, agentic } = parseArgs(process.argv);

  log(`Reading ${specFile} ...`);
  const source = readFileSync(specFile, "utf-8");

  const { preamble, theorems } = parseSpec(source);

  log(`Model: ${model}`);
  log(`Mode: ${agentic ? "agentic (tool-calling)" : "legacy (regeneration)"}`);
  if (agentic) {
    log(`Max iterations: ${maxIterations}`);
  } else {
    log(`Max retries: ${maxRetries}`);
  }
  log(`Found ${theorems.length} theorem(s): ${theorems.map((t) => t.name).join(", ")}\n`);

  if (theorems.length === 0) {
    log("No theorems found in spec.");
    process.exit(1);
  }

  // Prove all theorems in parallel
  log("Proving theorems in parallel...\n");
  const results = await Promise.all(
    theorems.map((theorem) =>
      agentic
        ? proveTheoremAgentic(preamble, theorem, { apiKey, model, maxIterations })
        : proveTheorem(preamble, theorem, { apiKey, model, maxRetries })
    )
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
