// Release flow: validates, bumps the version and leaves it ready to publish.
// Usage (run by the maintainer):
//   npm run release -- patch | minor | major | 0.2.0 [--dry-run]
// Never publishes alone: after the bump review the diff and run git push + npm publish.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pkgPath = join(root, "package.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const target = args.find((a) => !a.startsWith("--"));

function usage() {
  console.log("Usage: npm run release -- patch|minor|major|X.Y.Z [--dry-run]");
  console.log("Ex:  npm run release -- minor --dry-run");
  console.log("     npm run release -- 0.2.0");
}

function bump(v, kind) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`invalid current version: ${v}`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch" || !kind) return `${maj}.${min}.${pat + 1}`;
  throw new Error(`invalid bump type: ${kind}`);
}

if (!target) {
  usage();
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const next = bump(pkg.version, target);

// 1. Fail-safe validations (no keys, required files, gitignore).
const required = [
  "LICENSE",
  "README.md",
  ".env.example",
  ".gitignore",
  "tsconfig.json",
  "src/index.ts",
  "postinstall.mjs",
  "preuninstall.mjs",
  "scripts/setup.mjs",
  "agents/planner.md",
  "agents/explorer.md",
  "agents/implementer.md",
  "agents/reviewer.md",
  "skills/create-task/SKILL.md",
  "skills/pr-review/SKILL.md",
];
const missing = required.filter((f) => !existsSync(join(root, f)));
if (missing.length) {
  console.error("Missing required files:\n - " + missing.join("\n - "));
  process.exit(1);
}
const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
if (!/^\.env$/m.test(gitignore)) {
  console.error(".gitignore must ignore .env (a `.env` line).");
  process.exit(1);
}
// A .env with real keys must never exist here on publish.
try {
  const st = execSync("git check-ignore -q .env && echo ignored", { cwd: root, encoding: "utf8" });
  if (!st.includes("ignored")) throw new Error();
} catch {
  console.error(".env is not ignored by git. Aborting.");
  process.exit(1);
}

// 2. Build dist (what OpenCode actually loads via `main`) + verify tarball.
console.log(`\n== roleflow ${pkg.version} -> ${next} ${dryRun ? "(dry-run)" : ""} ==`);
console.log("Building dist/...");
try {
  execSync("npm run build --silent", { cwd: root, stdio: "inherit" });
} catch {
  console.error("Build failed (`npm run build`). Aborting.");
  process.exit(1);
}
if (!existsSync(join(root, "dist", "index.js"))) {
  console.error("dist/index.js missing after build. Aborting.");
  process.exit(1);
}
try {
  execSync("npm pack --dry-run", { cwd: root, stdio: "inherit" });
} catch {
  console.error("npm pack --dry-run failed. Aborting.");
  process.exit(1);
}

if (dryRun) {
  console.log(`\n[dry-run] would bump to ${next}. Nothing written.`);
  process.exit(0);
}

// 3. Bump + instructions (you run push/publish, never the script alone).
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`\n✔ package.json -> ${next}`);
console.log("Review the diff and publish:");
console.log(`  git add package.json`);
console.log(`  git commit -m "release: v${next}"`);
console.log(`  git tag v${next} && git push && git push --tags`);
console.log(`  npm publish --access public`);
