// Flujo release: valida, sube versión y deja listo para publicar.
// Uso (lo ejecuta el mantenedor):
//   npm run release -- patch | minor | major | 0.2.0 [--dry-run]
// No publica solo: tras el bump revisa el diff y corre git push + npm publish tú.
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
  console.log("Uso: npm run release -- patch|minor|major|X.Y.Z [--dry-run]");
  console.log("Ej:  npm run release -- minor --dry-run");
  console.log("     npm run release -- 0.2.0");
}

function bump(v, kind) {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`versión actual inválida: ${v}`);
  let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch" || !kind) return `${maj}.${min}.${pat + 1}`;
  throw new Error(`tipo inválido: ${kind}`);
}

if (!target) {
  usage();
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const next = bump(pkg.version, target);

// 1. Validaciones anti-fallo (no keys, ficheros requeridos, gitignore).
const required = [
  "LICENSE",
  "README.md",
  ".env.example",
  ".gitignore",
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
  console.error("Faltan ficheros requeridos:\n - " + missing.join("\n - "));
  process.exit(1);
}
const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
if (!/^\.env$/m.test(gitignore)) {
  console.error(".gitignore debe ignorar .env (línea `.env`).");
  process.exit(1);
}
// .env con keys reales nunca debe existir aquí al publicar.
try {
  const st = execSync("git check-ignore -q .env && echo ignored", { cwd: root, encoding: "utf8" });
  if (!st.includes("ignored")) throw new Error();
} catch {
  console.error(".env no está ignorado por git. Aborto.");
  process.exit(1);
}

// 2. npm pack --dry-run (no publica, solo verifica contenido del tarball).
console.log(`\n== roleflow ${pkg.version} -> ${next} ${dryRun ? "(dry-run)" : ""} ==`);
try {
  execSync("npm pack --dry-run", { cwd: root, stdio: "inherit" });
} catch {
  console.error("npm pack --dry-run falló. Aborto.");
  process.exit(1);
}

if (dryRun) {
  console.log(`\n[dry-run] subiría a ${next}. Sin cambios escritos.`);
  process.exit(0);
}

// 3. Bump + instrucciones (el push/publish lo haces tú, nunca el script solo).
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`\n✔ package.json -> ${next}`);
console.log("Revisa el diff y publica:");
console.log(`  git add package.json`);
console.log(`  git commit -m "release: v${next}"`);
console.log(`  git tag v${next} && git push && git push --tags`);
console.log(`  npm publish --access public`);
