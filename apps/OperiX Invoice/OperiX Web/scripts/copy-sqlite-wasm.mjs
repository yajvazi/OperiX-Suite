// The browser database ships as static files (not bundled): the sqlite-wasm loader starts its own workers
// and bundlers cannot follow that. Runs before `dev` and `build`.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json"));
const from = path.join(root, "dist");
const to = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "sqlite");
if (!existsSync(from)) throw new Error(`sqlite-wasm files not found at ${from}`);
mkdirSync(to, { recursive: true });
for (const file of readdirSync(from)) if (!file.endsWith(".d.mts") && file !== "node.mjs") cpSync(path.join(from, file), path.join(to, file));
