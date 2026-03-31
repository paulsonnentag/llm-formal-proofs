import https from "https";

export interface LlmOptions {
  apiKey: string;
  model: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatChoice {
  message: { content: string };
}

interface ChatResponse {
  choices: ChatChoice[];
  error?: { message: string };
}

const SYSTEM_PROMPT_FILE = `You are a Coq proof engineer. You receive a .v file containing definitions and unproven theorem statements. Return the complete file with all proofs filled in (Proof. ... Qed. after each Theorem/Lemma).

Rules:
- Output ONLY valid Coq code. No markdown fences, no commentary.
- Preserve all existing definitions, imports, and notations exactly.
- Every Theorem and Lemma must have a complete Proof ... Qed block.
- Do NOT use Admitted or Abort.`;

const SYSTEM_PROMPT_SINGLE = `You are a Coq proof engineer. You receive definitions and a single theorem statement. Return ONLY the proof block (starting with "Proof." and ending with "Qed.").

Rules:
- Output ONLY the proof block. No theorem statement, no definitions, no markdown fences.
- Start with "Proof." and end with "Qed."
- Do NOT use Admitted or Abort.`;

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

  return content;
}

export async function generate(
  spec: string,
  history: { attempt: string; errors: string }[],
  opts: LlmOptions
): Promise<string> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT_FILE },
    { role: "user", content: spec },
  ];

  for (const h of history) {
    messages.push({ role: "assistant", content: h.attempt });
    messages.push({
      role: "user",
      content: `coqc rejected the above with these errors:\n\n${h.errors}\n\nPlease fix the proofs and return the complete corrected .v file.`,
    });
  }

  return chat(messages, opts, history.length === 0 ? 0 : 0.2);
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
      content: `coqc rejected the proof with these errors:\n\n${h.errors}\n\nPlease fix and return ONLY the corrected proof block (Proof. ... Qed.).`,
    });
  }

  return chat(messages, opts, history.length === 0 ? 0 : 0.3);
}
