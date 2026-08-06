import { createServer, type Server } from "node:http";
import { createAdminClient } from "../lib/supabase/admin";
import { logEvent } from "../lib/logger";
import { syncMailboxes } from "./imap";
import { processEmailQueue, processMaintenance } from "./queue";

const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 3011);
const cycleInterval = Number(process.env.SUPPORT_WORKER_POLL_INTERVAL_MS ?? 5000);
const admin = createAdminClient();
const abortController = new AbortController();
let lastCycleAt: string | null = null;
let cycleRunning = false;
let activeCycle: Promise<void> | null = null;

function healthServer(): Server {
  return createServer((request, response) => {
    if (request.url === "/health" || request.url === "/ready") {
      const ready = Boolean(admin);
      response.statusCode = ready ? 200 : 503;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: ready ? "ok" : "not_ready", service: "operix-support-worker", lastCycleAt }));
      return;
    }
    response.statusCode = 404; response.end();
  });
}

async function cycle(): Promise<void> {
  if (!admin || cycleRunning || abortController.signal.aborted) return;
  cycleRunning = true;
  activeCycle = (async () => {
    try {
      await processEmailQueue(admin);
      await syncMailboxes(admin, abortController.signal);
      await processMaintenance(admin);
      lastCycleAt = new Date().toISOString();
    } catch (error) { logEvent("worker_cycle_failed", { error: error instanceof Error ? error.message : String(error) }); }
    finally { cycleRunning = false; activeCycle = null; }
  })();
  await activeCycle;
}

const server = healthServer();
server.listen(healthPort, () => logEvent("worker_started", { healthPort, cycleInterval, imapStrategy: "idle_with_poll_fallback" }));
const timer = setInterval(() => { void cycle(); }, cycleInterval);
void cycle();

async function shutdown(signal: string): Promise<void> {
  logEvent("worker_shutdown_started", { signal });
  clearInterval(timer); abortController.abort();
  if (activeCycle) await activeCycle;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  logEvent("worker_shutdown_complete");
}

process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
