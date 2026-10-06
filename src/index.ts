import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Auto-loads .env (project root or ~/.config/opencode/.env) so manual `source` is not required.
// Never overwrites already exported vars. .env stays gitignored, never published.
function loadDotEnv(): void {
  try {
    if (process.env.ZAI_API_KEY && process.env.OPENCODE_GO_API_KEY) return;
    const candidates: string[] = [join(process.cwd(), ".env")];
    const home = process.env.HOME ?? process.env.USERPROFILE;
    if (home) candidates.push(join(home, ".config", "opencode", ".env"));
    for (const p of candidates) {
      try {
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, "utf8").split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq < 0) continue;
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed
            .slice(eq + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          if (key && !process.env[key]) process.env[key] = value;
        }
        break;
      } catch {}
    }
  } catch {}
}

// Personal system: cheap role-based routing + automatic output trimming.
// Agents/skills ship under ./agents and ./skills; postinstall copies them
// to ~/.config/opencode/agents and skills (current OpenCode compat).
// Projects can always override in their opencode.json / AGENTS.md.

const MAX_OUTPUT_CHARS = 6000;

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (!text || text.length <= max) return text;
  return (
    text.slice(0, max) +
    `\n…[truncated by roleflow: ${text.length - max} chars omitted, request exact range with offset/limit]`
  );
}

export const RoleflowPlugin: Plugin = async (_ctx) => {
  loadDotEnv();
  return {
    // Trims huge outputs (logs, reads, tests) before they enter context.
    // Biggest saving without quality loss: the model requests the range it needs.
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = String(input?.tool ?? "");
      if (toolName === "read" || toolName === "bash" || toolName === "grep") {
        const out = (output as any)?.output;
        if (typeof out === "string" && out.length > MAX_OUTPUT_CHARS) {
          (output as any).output = truncate(out);
        }
      }
    },

    // Keeps useful state on compact: what was being done and what is next.
    "experimental.session.compacting": async (_input: any, output: any) => {
      output?.context?.push?.(
        "## Roleflow: preserve active role, current task, touched files and next step. Drop full dumps and old logs."
      );
    },

    config: async (config: any) => {
      // Cheap defaults. Projects can override them in their opencode.json.
      config.model = config.model ?? "opencode-go/glm-5.3-flash";
      config.small_model = config.small_model ?? "opencode-go/qwen3.7-plus";
      config.agents = config.agents ?? {};
      config.agents.planner = {
        model: "opencode-go/glm-5.3",
        ...(config.agents.planner ?? {}),
      };
      config.agents.implementer = {
        model: "opencode-go/kimi-k2.7-code",
        ...(config.agents.implementer ?? {}),
      };
      config.agents.reviewer = {
        model: "opencode-go/qwen3.7-plus",
        ...(config.agents.reviewer ?? {}),
      };
    },
  };
};

// Deprecated alias (pre-1.1 Spanish name). Kept for backwards compatibility.
export const MiSistemaPlugin = RoleflowPlugin;

export default RoleflowPlugin;
