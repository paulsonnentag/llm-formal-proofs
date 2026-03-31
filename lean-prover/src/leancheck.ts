import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface CheckResult {
  success: boolean;
  errors: string;
  rawOutput?: string;
}

const LEAN_PATH = join(process.env.HOME || "", ".elan", "bin", "lean");

function parseRichErrors(raw: string, tmpPath: string): string {
  const lines = raw.split("\n");
  const result: string[] = [];
  let inGoalBlock = false;
  let goalBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Replace temp file path with <file> for cleaner output
    const cleanLine = line.replace(tmpPath, "<file>");

    // Detect error lines with line:col info
    if (cleanLine.includes("error:")) {
      if (goalBuffer.length > 0) {
        result.push(...goalBuffer);
        goalBuffer = [];
      }
      result.push(cleanLine);
      inGoalBlock = false;
      continue;
    }

    // Detect "unsolved goals" header
    if (cleanLine.includes("unsolved goals")) {
      inGoalBlock = true;
      result.push(cleanLine);
      continue;
    }

    // Detect type mismatch or other important info
    if (cleanLine.includes("type mismatch") || 
        cleanLine.includes("expected type") ||
        cleanLine.includes("has type")) {
      result.push(cleanLine);
      continue;
    }

    // Capture goal state lines (indented lines after "unsolved goals")
    if (inGoalBlock) {
      if (cleanLine.trim() === "" || cleanLine.match(/^[a-zA-Z]/)) {
        // End of goal block
        inGoalBlock = false;
        if (goalBuffer.length > 0) {
          result.push(...goalBuffer);
          goalBuffer = [];
        }
      } else {
        goalBuffer.push(cleanLine);
      }
      continue;
    }

    // Capture case/context info
    if (cleanLine.match(/^case\s+/)) {
      result.push(cleanLine);
      continue;
    }

    // Capture hypothesis lines (things like "sched : Schedule")
    if (cleanLine.match(/^\s+\w+\s*:\s*/)) {
      result.push(cleanLine);
    }
  }

  // Flush any remaining goal buffer
  if (goalBuffer.length > 0) {
    result.push(...goalBuffer);
  }

  const parsed = result.join("\n").trim();
  
  // If parsing didn't capture much, return a cleaned version of raw output
  if (parsed.length < 20) {
    return raw
      .replace(new RegExp(tmpPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "<file>")
      .trim() || "Unknown Lean error";
  }

  return parsed;
}

export function check(leanSource: string): CheckResult {
  const tmp = join(tmpdir(), `lean_prover_${Date.now()}_${Math.random().toString(36).slice(2)}.lean`);

  try {
    writeFileSync(tmp, leanSource, "utf-8");

    execSync(`"${LEAN_PATH}" "${tmp}" 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });

    return { success: true, errors: "" };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const raw = (e.stdout || "") + (e.stderr || "");

    const errors = parseRichErrors(raw, tmp);

    return { 
      success: false, 
      errors,
      rawOutput: raw.replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "<file>")
    };
  } finally {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch {}
    }
  }
}
