import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface CheckResult {
  success: boolean;
  errors: string;
  rawOutput?: string;
}

// Path to the WASM build (v4.15.0 is the newest version with WASM support)
const WASM_DIR = join(__dirname, "..", "lean-wasm", "lean-4.15.0-linux_wasm32");
const LEAN_JS = join(WASM_DIR, "bin", "lean-patched.js");
const LEAN_LIB = join(WASM_DIR, "lib", "lean");

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

    // Capture hypothesis lines
    if (cleanLine.match(/^\s+\w+\s*:\s*/)) {
      result.push(cleanLine);
    }
  }

  if (goalBuffer.length > 0) {
    result.push(...goalBuffer);
  }

  const parsed = result.join("\n").trim();
  
  if (parsed.length < 20) {
    return raw
      .replace(new RegExp(tmpPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "<file>")
      .trim() || "Unknown Lean error";
  }

  return parsed;
}

export function check(leanSource: string): CheckResult {
  // WASM mounts /Users/paul, so temp files must be under user's home directory
  const homeDir = process.env.HOME || "/tmp";
  const tmp = join(homeDir, `.lean_wasm_${Date.now()}_${Math.random().toString(36).slice(2)}.lean`);

  try {
    writeFileSync(tmp, leanSource, "utf-8");

    // Set LEAN_PATH environment variable for the WASM build
    const env = { ...process.env, LEAN_PATH: LEAN_LIB };
    
    execSync(`node "${LEAN_JS}" "${tmp}" 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,  // WASM may be slower, allow 2 minutes
      env
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

// Also export a function to check if WASM is available
export function isWasmAvailable(): boolean {
  return existsSync(LEAN_JS) && existsSync(LEAN_LIB);
}
