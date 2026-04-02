import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface CheckResult {
  success: boolean;
  errors: string;
  rawOutput?: string;
}

function parseCoqErrors(raw: string, tmpPath: string): string {
  const lines = raw.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const cleanLine = line.replace(tmpPath, "<file>");

    // Capture error lines
    if (cleanLine.includes("Error:") || cleanLine.includes("error:")) {
      result.push(cleanLine);
      continue;
    }

    // Capture "The term" type mismatch info
    if (cleanLine.includes("The term") || cleanLine.includes("has type")) {
      result.push(cleanLine);
      continue;
    }

    // Capture "expected" type info
    if (cleanLine.includes("expected") || cleanLine.includes("while it is")) {
      result.push(cleanLine);
      continue;
    }

    // Capture goal state info
    if (cleanLine.match(/^\d+ (goal|subgoal)/)) {
      result.push(cleanLine);
      continue;
    }

    // Capture hypothesis lines (indented with colon)
    if (cleanLine.match(/^\s+\w+\s*:/)) {
      result.push(cleanLine);
      continue;
    }

    // Capture "In environment" context
    if (cleanLine.includes("In environment")) {
      result.push(cleanLine);
      continue;
    }

    // Capture unable to unify messages
    if (cleanLine.includes("Unable to unify")) {
      result.push(cleanLine);
      continue;
    }
  }

  const parsed = result.join("\n").trim();

  if (parsed.length < 20) {
    return raw
      .replace(new RegExp(tmpPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<file>")
      .trim() || "Unknown Coq error";
  }

  return parsed;
}

export function check(coqSource: string): CheckResult {
  const tmp = join(tmpdir(), `coq_${Date.now()}_${Math.random().toString(36).slice(2)}.v`);

  try {
    writeFileSync(tmp, coqSource, "utf-8");

    execSync(`coqc "${tmp}" 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });

    return { success: true, errors: "" };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const raw = (e.stdout || "") + (e.stderr || "");

    const errors = parseCoqErrors(raw, tmp);

    return {
      success: false,
      errors,
      rawOutput: raw.replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<file>"),
    };
  } finally {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {}
    }
    // Also clean up .vo and .glob files that coqc creates
    const voFile = tmp.replace(/\.v$/, ".vo");
    const globFile = tmp.replace(/\.v$/, ".glob");
    if (existsSync(voFile)) {
      try {
        unlinkSync(voFile);
      } catch {}
    }
    if (existsSync(globFile)) {
      try {
        unlinkSync(globFile);
      } catch {}
    }
  }
}

export function isCoqAvailable(): boolean {
  try {
    execSync("coqc --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}
