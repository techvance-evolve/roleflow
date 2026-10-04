// Copia agents/ y skills/ del paquete al config de OpenCode.
// OpenCode hoy no registra agentes dinámicos desde el plugin de forma estable,
// por eso este postinstall es el puente estándar (ver opencode-plugin-opencoder).
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(homedir(), ".config", "opencode");

for (const dir of ["agents", "skills"]) {
  const from = join(here, dir);
  const to = join(dest, dir);
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[roleflow] ${dir} -> ${to}`);
}
