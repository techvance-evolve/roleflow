// Setup interactivo: pide las API keys y las guarda en .env (gitignored).
// Uso: npm run setup   (lo ejecuta el usuario en su PC o server)
// Este repo público NUNCA contiene keys reales, solo .env.example con placeholders.
import { createInterface } from "node:readline";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const envPath = join(root, ".env");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    if (!hidden || !process.stdin.isTTY) {
      rl.question(question, (ans) => resolve(ans.trim()));
      return;
    }
    // Entrada oculta simple (no muestra lo tecleado).
    const stdin = process.stdin;
    let value = "";
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (ch) => {
      const s = String(ch);
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value.trim());
      } else if (s === "\u0003") {
        process.exit(1);
      } else if (s === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += s;
      }
    };
    stdin.on("data", onData);
  });
}

function mask(v) {
  if (!v) return "(vacía)";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "…" + v.slice(-4) + ` (${v.length} chars)`;
}

const fields = [
  {
    key: "ZAI_API_KEY",
    label: "Z.ai API key (GLM Coding Plan: planner glm-5.3)",
    where: "Consíguela en tu panel de Z.ai -> API keys",
    required: true,
  },
  {
    key: "OPENCODE_GO_API_KEY",
    label: "OpenCode Go API key (pool barato: flash / k2.7 / qwen-plus)",
    where: "Consíguela en opencode.ai -> Go -> API key",
    required: true,
  },
  {
    key: "OPENCODE_ZEN_API_KEY",
    label: "OpenCode Zen API key (buffer pay-as-you-go, opcional)",
    where: "Consíguela en opencode.ai -> Zen. Enter para omitir.",
    required: false,
  },
];

console.log("\n== Roleflow: setup interactivo ===");
console.log("Guarda las keys en .env (gitignored). Nada se sube al repo.\n");

const current = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) current[m[1]] = m[2];
  }
  console.log("Ya existe un .env, las vacías se conservan.\n");
}

const result = { ...current };
for (const f of fields) {
  console.log(`\n${f.label}`);
  console.log(`  ${f.where}`);
  if (current[f.key]) console.log(`  Actual: ${mask(current[f.key])} (Enter para conservar)`);
  const ans = await ask(`${f.key}: `, { hidden: true });
  if (ans) result[f.key] = ans;
  else if (!result[f.key] && f.required) {
    console.log("  ⚠ Queda vacía: el planner/pool que la usa fallará hasta que la pongas.");
    result[f.key] = "";
  }
}

const content =
  "# Generado por `npm run setup`. NO subir al repo (está en .gitignore).\n" +
  Object.entries(result)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") +
  "\n";

writeFileSync(envPath, content);
console.log(`\n✔ Guardado en ${envPath}`);
console.log("Para usarlas en esta terminal:");
console.log("  set -a; source .env; set +a   (bash/zsh)");
console.log("Luego abre OpenCode en tu proyecto y el plugin toma las keys del entorno.\n");
rl.close();
