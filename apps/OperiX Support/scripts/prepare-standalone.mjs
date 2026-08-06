import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const appRoot = process.cwd();
const standaloneRoot = join(appRoot, ".next", "standalone", "apps", "OperiX Support");

await mkdir(join(standaloneRoot, ".next"), { recursive: true });
await cp(join(appRoot, ".next", "static"), join(standaloneRoot, ".next", "static"), { recursive: true, force: true });
await cp(join(appRoot, "public"), join(standaloneRoot, "public"), { recursive: true, force: true });
