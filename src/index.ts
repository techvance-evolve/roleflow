import type { Plugin } from "@opencode-ai/plugin";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// Auto-loads .env (project root or ~/.config/opencode/.env) so manual `source` is not required.
// Native env names only: ZAI_API_KEY (zai-coding-plan) and OPENCODE_API_KEY (opencode-go / opencode).
// Never overwrites already exported vars. .env stays gitignored, never published.
function loadDotEnv(): void {
  try {
    if (process.env.ZAI_API_KEY && process.env.OPENCODE_API_KEY) return;
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

// Belt-and-suspenders: if the env vars exist, make sure the native providers
// have their apiKey wired even if the provider scan ran before plugin init.
function wireProviders(config: any): void {
  try {
    config.provider = config.provider ?? {};
    const ensure = (id: string, apiKey: string | undefined) => {
      if (!apiKey) return;
      config.provider[id] = config.provider[id] ?? {};
      config.provider[id].options = config.provider[id].options ?? {};
      if (!config.provider[id].options.apiKey) config.provider[id].options.apiKey = apiKey;
    };
    ensure("opencode-go", process.env.OPENCODE_API_KEY);
    ensure("opencode", process.env.OPENCODE_API_KEY);
    ensure("zai-coding-plan", process.env.ZAI_API_KEY);
  } catch {}
}

// Self-installs agents/skills into ~/.config/opencode on every startup.
// OpenCode installs npm plugins via Bun into its own cache and may skip the
// npm `postinstall` lifecycle, so relying on postinstall alone leaves fresh
// machines without @planner/@explorer/@implementer/@reviewer. This runs inside
// OpenCode itself (Bun handles TS), needs no system node, never throws.
function ensureCompatFiles(): void {
  try {
    let pkgRoot = "";
    try {
      pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
    } catch {
      return;
    }
    const dest = join(homedir(), ".config", "opencode");
    for (const dir of ["agents", "skills"] as const) {
      try {
        const from = join(pkgRoot, dir);
        if (!existsSync(from)) continue;
        const to = join(dest, dir);
        mkdirSync(to, { recursive: true });
        cpSync(from, to, { recursive: true });
      } catch {}
    }
  } catch {}
}

// Personal system: cheap role-based routing + automatic output trimming.
// Agents/skills ship under ./agents and ./skills; they are self-installed at
// runtime (see above) with postinstall.mjs kept as a fallback for global installs.
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
  ensureCompatFiles();
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
      // Activate providers (env mapping + apiKey injection) before defaults.
      wireProviders(config);
      // Cheap defaults. Projects can override them in their opencode.json.
      // Uses the NATIVE `agent` key (OpenCode schema) - `agents` (plural) is ignored.
      // GLM volume (chat + planner) rides the Z.AI Coding Plan ($80, big quota).
      // Kimi/qwen (non-GLM) ride the OpenCode Go cheap pool.
      config.model = config.model ?? "zai-coding-plan/glm-5.3-flash";
      config.small_model = config.small_model ?? "opencode-go/qwen3.7-plus";
      config.agent = config.agent ?? {};
      config.agent.planner = {
        model: "zai-coding-plan/glm-5.3",
        ...(config.agent.planner ?? {}),
      };
      config.agent.implementer = {
        model: "opencode-go/kimi-k2.7-code",
        ...(config.agent.implementer ?? {}),
      };
      config.agent.reviewer = {
        model: "opencode-go/qwen3.7-plus",
        ...(config.agent.reviewer ?? {}),
      };
      config.agent.explorer = {
        model: "zai-coding-plan/glm-5.3-flash",
        ...(config.agent.explorer ?? {}),
      };
    },
  };
};

// Deprecated alias (pre-1.1 Spanish name). Kept for backwards compatibility.
export const MiSistemaPlugin = RoleflowPlugin;

export default RoleflowPlugin;
