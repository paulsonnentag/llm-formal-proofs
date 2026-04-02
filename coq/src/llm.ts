import https from "https";
import { TOOLS, ToolDefinition } from "./tools";

export interface LlmOptions {
  apiKey: string;
  model: string;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatChoice {
  message: {
    content: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface ChatResponse {
  choices: ChatChoice[];
  error?: { message: string };
}

const SYSTEM_PROMPT_SINGLE = `You are a Coq proof engineer. You receive definitions and a theorem statement. Return ONLY the proof tactics (the part between "Proof." and "Qed.").

Rules:
- Output ONLY the tactic proof. No theorem statement, no definitions, no markdown fences.
- Do NOT include "Proof." or "Qed." - just the tactics.
- Each tactic should end with a period.
- Common tactics: intros, apply, exact, reflexivity, simpl, unfold, rewrite, induction, destruct, auto, lia, omega.
- For arithmetic on nat, lia or omega are very powerful.
- Do NOT use Admitted.`;

const SYSTEM_PROMPT_AGENTIC = `You are a Coq proof engineer with access to tools for iteratively developing proofs.

Your workflow:
1. Start by writing an initial proof attempt using replace_all
2. Use check_proof to see if it works
3. If there are errors, analyze them and use replace_line, insert_line, or delete_line to fix specific issues
4. Repeat checking and fixing until the proof passes
5. Once check_proof succeeds, call submit to finalize

Available tactics: intros, apply, exact, reflexivity, simpl, unfold, rewrite, induction, destruct, auto, lia, omega, trivial, assumption, constructor, split, left, right, exists, assert, pose, set.

Tips:
- Read error messages carefully - they show the goal state and what went wrong
- "No more subgoals" with an error means you have unfinished goals
- "Unable to unify" means the tactic produced the wrong type
- Each tactic must end with a period (e.g., "intros." not "intros")
- For induction on nat, use "induction n." then handle base and inductive cases
- Make targeted fixes rather than rewriting everything
- For arithmetic goals, try "lia." or "omega." (if available)`;

export { SYSTEM_PROMPT_AGENTIC };

function post(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString()));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function chat(messages: Message[], opts: LlmOptions, temperature: number): Promise<string> {
  const body = JSON.stringify({
    model: opts.model,
    messages,
    temperature,
  });

  const raw = await post("https://openrouter.ai/api/v1/chat/completions", body, {
    Authorization: `Bearer ${opts.apiKey}`,
    "HTTP-Referer": "https://github.com/coq-prover",
  });

  const resp: ChatResponse = JSON.parse(raw);

  if (resp.error) {
    throw new Error(`OpenRouter API error: ${resp.error.message}`);
  }

  if (!resp.choices?.[0]?.message?.content) {
    throw new Error(`Unexpected API response: ${raw.slice(0, 500)}`);
  }

  let content = resp.choices[0].message.content.trim();

  // Strip markdown fences if the model included them despite instructions
  if (content.startsWith("```")) {
    content = content.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  }

  // Strip "Proof." and "Qed." if the model included them
  content = content.replace(/^Proof\.\s*/i, "").replace(/\s*Qed\.$/i, "");

  return content;
}

export interface ChatWithToolsResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  finishReason: string;
}

export async function chatWithTools(
  messages: Message[],
  opts: LlmOptions,
  tools: ToolDefinition[],
  temperature: number = 0
): Promise<ChatWithToolsResponse> {
  const body = JSON.stringify({
    model: opts.model,
    messages,
    tools,
    temperature,
  });

  const raw = await post("https://openrouter.ai/api/v1/chat/completions", body, {
    Authorization: `Bearer ${opts.apiKey}`,
    "HTTP-Referer": "https://github.com/coq-prover",
  });

  const resp: ChatResponse = JSON.parse(raw);

  if (resp.error) {
    throw new Error(`OpenRouter API error: ${resp.error.message}`);
  }

  if (!resp.choices?.[0]?.message) {
    throw new Error(`Unexpected API response: ${raw.slice(0, 500)}`);
  }

  const message = resp.choices[0].message;
  const finishReason = resp.choices[0].finish_reason;

  return {
    content: message.content,
    toolCalls: message.tool_calls || null,
    finishReason,
  };
}

export function getAgenticTools(): ToolDefinition[] {
  return TOOLS;
}

export async function generateProof(
  preamble: string,
  theoremStatement: string,
  history: { attempt: string; errors: string }[],
  opts: LlmOptions
): Promise<string> {
  const userContent = `${preamble}\n\n${theoremStatement}`;

  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT_SINGLE },
    { role: "user", content: userContent },
  ];

  for (const h of history) {
    messages.push({ role: "assistant", content: h.attempt });
    messages.push({
      role: "user",
      content: `Coq rejected the proof with these errors:\n\n${h.errors}\n\nPlease fix and return ONLY the corrected tactics (no "Proof.", no "Qed.", no theorem statement).`,
    });
  }

  return chat(messages, opts, history.length === 0 ? 0 : 0.3);
}
