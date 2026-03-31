import { check, CheckResult } from "./leancheck-wasm";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "check_proof",
      description:
        "Run Lean on the current proof tactics to see if they work. Returns success or detailed error messages including goal states.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_line",
      description:
        "Replace a specific line in the current proof. Line numbers are 1-indexed.",
      parameters: {
        type: "object",
        properties: {
          line_number: {
            type: "number",
            description: "The 1-indexed line number to replace",
          },
          new_content: {
            type: "string",
            description: "The new content for that line",
          },
        },
        required: ["line_number", "new_content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_line",
      description: "Insert a new line after the specified line number. Use 0 to insert at the beginning.",
      parameters: {
        type: "object",
        properties: {
          after_line: {
            type: "number",
            description: "Insert after this line number (0 = insert at start)",
          },
          content: {
            type: "string",
            description: "The content to insert",
          },
        },
        required: ["after_line", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_line",
      description: "Delete a specific line from the proof.",
      parameters: {
        type: "object",
        properties: {
          line_number: {
            type: "number",
            description: "The 1-indexed line number to delete",
          },
        },
        required: ["line_number"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replace_all",
      description:
        "Replace the entire proof with new tactics. Use this for major restructuring.",
      parameters: {
        type: "object",
        properties: {
          tactics: {
            type: "string",
            description: "The complete new proof tactics",
          },
        },
        required: ["tactics"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit",
      description:
        "Submit the current proof as final. Only call this after check_proof returns success.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

export interface ProofState {
  tactics: string;
  preamble: string;
  theoremStatement: string;
}

export interface ToolCallResult {
  success: boolean;
  output: string;
  proofSubmitted?: boolean;
  updatedTactics?: string;
}

function buildFullFile(state: ProofState): string {
  const indentedProof = state.tactics
    .split("\n")
    .map((l) => (l.trim() ? "  " + l : l))
    .join("\n");
  return `${state.preamble}\n\n${state.theoremStatement} := by\n${indentedProof}\n`;
}

function formatProofWithLineNumbers(tactics: string): string {
  const lines = tactics.split("\n");
  return lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
}

export function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  state: ProofState
): ToolCallResult {
  switch (toolName) {
    case "check_proof": {
      const fullFile = buildFullFile(state);
      const result: CheckResult = check(fullFile);

      if (result.success) {
        return {
          success: true,
          output: "Proof checks successfully! You can now call submit() to finalize.",
        };
      } else {
        const currentProof = formatProofWithLineNumbers(state.tactics);
        return {
          success: false,
          output: `Lean errors:\n${result.errors}\n\nCurrent proof (with line numbers):\n${currentProof}`,
        };
      }
    }

    case "replace_line": {
      const lineNum = args.line_number as number;
      const newContent = args.new_content as string;
      const lines = state.tactics.split("\n");

      if (lineNum < 1 || lineNum > lines.length) {
        return {
          success: false,
          output: `Invalid line number ${lineNum}. Proof has ${lines.length} lines.`,
        };
      }

      lines[lineNum - 1] = newContent;
      const updatedTactics = lines.join("\n");

      return {
        success: true,
        output: `Replaced line ${lineNum}. New proof:\n${formatProofWithLineNumbers(updatedTactics)}`,
        updatedTactics,
      };
    }

    case "insert_line": {
      const afterLine = args.after_line as number;
      const content = args.content as string;
      const lines = state.tactics.split("\n");

      if (afterLine < 0 || afterLine > lines.length) {
        return {
          success: false,
          output: `Invalid line number ${afterLine}. Proof has ${lines.length} lines.`,
        };
      }

      lines.splice(afterLine, 0, content);
      const updatedTactics = lines.join("\n");

      return {
        success: true,
        output: `Inserted line after ${afterLine}. New proof:\n${formatProofWithLineNumbers(updatedTactics)}`,
        updatedTactics,
      };
    }

    case "delete_line": {
      const lineNum = args.line_number as number;
      const lines = state.tactics.split("\n");

      if (lineNum < 1 || lineNum > lines.length) {
        return {
          success: false,
          output: `Invalid line number ${lineNum}. Proof has ${lines.length} lines.`,
        };
      }

      lines.splice(lineNum - 1, 1);
      const updatedTactics = lines.join("\n");

      return {
        success: true,
        output: `Deleted line ${lineNum}. New proof:\n${formatProofWithLineNumbers(updatedTactics)}`,
        updatedTactics,
      };
    }

    case "replace_all": {
      const tactics = args.tactics as string;
      return {
        success: true,
        output: `Replaced entire proof. New proof:\n${formatProofWithLineNumbers(tactics)}`,
        updatedTactics: tactics,
      };
    }

    case "submit": {
      const fullFile = buildFullFile(state);
      const result = check(fullFile);

      if (result.success) {
        return {
          success: true,
          output: "Proof submitted successfully!",
          proofSubmitted: true,
        };
      } else {
        return {
          success: false,
          output: `Cannot submit - proof still has errors:\n${result.errors}`,
        };
      }
    }

    default:
      return {
        success: false,
        output: `Unknown tool: ${toolName}`,
      };
  }
}
