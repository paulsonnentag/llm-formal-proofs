import { execSync } from "child_process";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";

export interface CheckResult {
  success: boolean;
  errors: string;
}

const JSCOQ_CLI = join(dirname(require.resolve("jscoq/package.json")), "dist-cli", "cli.cjs");

export function check(coqSource: string): CheckResult {
  const tmp = join(tmpdir(), `coq_prover_${Date.now()}_${Math.random().toString(36).slice(2)}.v`);

  try {
    writeFileSync(tmp, coqSource, "utf-8");

    const output = execSync(`node "${JSCOQ_CLI}" run -l "${tmp}" --verbose 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });

    return { success: true, errors: "" };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const raw = (e.stdout || "") + (e.stderr || "");

    // Strip jscoq loading noise, keep only diagnostics
    const errors = raw
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        if (!t || t === "[" || t === "]" || t === "[  ]") return false;
        if (/^\[Debug\]|LibProgress|LoadedPkg|coq-pkg|done: true|Coq worker ready/.test(t)) return false;
        if (/^Processed \d+$/.test(t)) return false;
        if (/^\[?\s*'\//.test(t)) return false; // path arrays from package loading
        if (/^\{$|^\}$|^\]$|^\[$/.test(t)) return false;
        return true;
      })
      .join("\n")
      .trim() || e.message || "Unknown jscoq error";
    return { success: false, errors };
  } finally {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch {}
    }
  }
}
