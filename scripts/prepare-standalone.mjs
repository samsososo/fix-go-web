import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneRoot = path.join(root, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");
const staticSource = path.join(root, ".next", "static");
const staticTarget = path.join(standaloneNextRoot, "static");
const publicSource = path.join(root, "public");
const publicTarget = path.join(standaloneRoot, "public");
const tracedDataTarget = path.join(standaloneRoot, "data");

if (!existsSync(standaloneRoot)) {
  console.warn("Standalone output not found; skipping asset preparation.");
  process.exit(0);
}

mkdirSync(standaloneNextRoot, { recursive: true });

if (existsSync(staticSource)) {
  rmSync(staticTarget, { recursive: true, force: true });
  cpSync(staticSource, staticTarget, { recursive: true });
}

if (existsSync(publicSource)) {
  rmSync(publicTarget, { recursive: true, force: true });
  cpSync(publicSource, publicTarget, { recursive: true });
}

rmSync(tracedDataTarget, { recursive: true, force: true });
