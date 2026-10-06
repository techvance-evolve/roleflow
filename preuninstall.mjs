// Cleanup on uninstall: removes only this package's files.
import { rmSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dest = join(homedir(), ".config", "opencode");
const mine = ["planner.md", "explorer.md", "implementer.md", "reviewer.md"];

const agentsDir = join(dest, "agents");
if (existsSync(agentsDir)) {
  for (const f of mine) {
    const p = join(agentsDir, f);
    try {
      rmSync(p, { force: true });
      console.log(`[roleflow] removed ${p}`);
    } catch {}
  }
}

for (const s of ["create-task", "pr-review"]) {
  const p = join(dest, "skills", s);
  if (existsSync(p)) {
    try {
      rmSync(p, { recursive: true, force: true });
      console.log(`[roleflow] removed ${p}`);
    } catch {}
  }
}

try {
  const leftovers = readdirSync(agentsDir);
  void leftovers;
} catch {}
