import type { Plugin } from "@opencode-ai/plugin";

// Sistema personal: routing barato por rol + recorte automático de outputs.
// Los agentes/skills viajan en ./agents y ./skills y el postinstall los deja
// en ~/.config/opencode/agents y skills (compatibilidad actual de OpenCode).
// El proyecto siempre puede hacer override en su opencode.json/AgENTS.md.

const MAX_OUTPUT_CHARS = 6000;

function truncate(text: string, max = MAX_OUTPUT_CHARS): string {
  if (!text || text.length <= max) return text;
  return (
    text.slice(0, max) +
    `\n…[truncado por roleflow: ${text.length - max} chars omitidos, pide rango exacto con offset/limit]`
  );
}

export const MiSistemaPlugin: Plugin = async (_ctx) => {
  return {
    // Recorta outputs gigantes (logs, reads, tests) antes de que entren al contexto.
    // Es el mayor ahorro sin perder calidad: el modelo pide el rango que sí necesita.
    "tool.execute.after": async (input: any, output: any) => {
      const toolName = String(input?.tool ?? "");
      if (toolName === "read" || toolName === "bash" || toolName === "grep") {
        const out = (output as any)?.output;
        if (typeof out === "string" && out.length > MAX_OUTPUT_CHARS) {
          (output as any).output = truncate(out);
        }
      }
    },

    // Mantiene estado útil al compactar: qué se estaba haciendo y qué sigue.
    "experimental.session.compacting": async (_input: any, output: any) => {
      output?.context?.push?.(
        "## Roleflow: preserva rol activo, tarea actual, archivos tocados y siguiente paso. Descarta dumps completos y logs viejos."
      );
    },

    config: async (config: any) => {
      // Defaults baratos. El proyecto los puede sobreescribir en su opencode.json.
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

export default MiSistemaPlugin;
