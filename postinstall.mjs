// Copies the package agents/ and skills/ into the OpenCode config.
// OpenCode does not reliably register dynamic agents from the plugin yet,
// so this postinstall is the standard bridge (see opencode-plugin-opencoder).
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
