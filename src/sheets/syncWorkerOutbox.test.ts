// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";

interface Stored {
  id: string;
  payload: string;
  created_at: number;
  next_attempt_at: number;
  attempts: number;
  lock_until: number;
  delivered_at: number | null;
}
function harness() {
  const rows = new Map<string, Stored>();
  let leaseOwner: string | null = null;
  let leaseUntil = 0;
  let inFlight = 0;
  let maxConcurrency = 0;
  let upstreamCalls = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run(): Promise<{ meta: { changes: number } }> {
              let changes = 0;
              if (sql.startsWith("INSERT OR IGNORE INTO sync_outbox")) {
                const [id, payload, created, next] = args as [string, string, number, number];
                if (!rows.has(id)) {
                  rows.set(id, { id, payload, created_at: created, next_attempt_at: next,
                    attempts: 0, lock_until: 0, delivered_at: null });
                  changes = 1;
                }
              } else if (sql.startsWith("UPDATE sync_dispatch_lease SET lock_until=?,owner=?")) {
                const [expires, owner, now] = args as [number, string, number];
                if (leaseUntil <= now) { leaseUntil = expires; leaseOwner = owner; changes = 1; }
              } else if (sql.startsWith("UPDATE sync_dispatch_lease SET lock_until=0")) {
                if (leaseOwner === args[0]) { leaseOwner = null; leaseUntil = 0; changes = 1; }
              } else if (sql.startsWith("UPDATE sync_outbox SET lock_until=?,attempts=")) {
                const [expires, id, now] = args as [number, string, number];
                const row = rows.get(id);
                if (row && row.delivered_at === null && row.lock_until <= now) {
                  row.lock_until = expires; row.attempts++; changes = 1;
                }
              } else if (sql.startsWith("UPDATE sync_outbox SET delivered_at=?")) {
                const row = rows.get(args[1] as string);
                if (row) { row.delivered_at = args[0] as number; row.lock_until = 0; changes = 1; }
              } else if (sql.startsWith("UPDATE sync_outbox SET lock_until=0,next_attempt_at=?")) {
                const row = rows.get(args[2] as string);
                if (row) { row.next_attempt_at = args[0] as number; row.lock_until = 0; changes = 1; }
              } else {
                throw new Error("Unexpected SQL run: " + sql);
              }
              return { meta: { changes } };
            },
            async first(): Promise<Record<string, unknown> | null> {
              if (sql.startsWith("SELECT delivered_at FROM sync_outbox")) {
                const row = rows.get(args[0] as string);
                return row ? { delivered_at: row.delivered_at } : null;
              }
              if (sql.startsWith("SELECT id,payload,attempts FROM sync_outbox")) {
                const now = args[0] as number;
                const candidate = [...rows.values()].filter(row =>
                  row.delivered_at === null && row.next_attempt_at <= now && row.lock_until <= now
                ).sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))[0];
                return candidate ? { id: candidate.id, payload: candidate.payload, attempts: candidate.attempts } : null;
              }
              throw new Error("Unexpected SQL first: " + sql);
            }
          };
        }
      };
    }
  };
  const source = readFileSync(new URL("../../sync-service/worker.mjs", import.meta.url), "utf8")
    .replace("export default {", "globalThis.bridge = {");
  const sandbox: Record<string, unknown> = {
    Request, Response, Headers, TextEncoder, Uint8Array, crypto: webcrypto, console,
    fetch: async () => {
      upstreamCalls++;
      inFlight++;
      maxConcurrency = Math.max(maxConcurrency, inFlight);
      await new Promise(resolve => setTimeout(resolve, 10));
      inFlight--;
      return { ok: true, json: async () => ({ ok: true, result: null }) };
    }
  };
  runInNewContext(source, sandbox);
  const bridge = sandbox.bridge as {
    fetch: (request: Request, env: unknown, ctx: { waitUntil: (task: Promise<void>) => void }) => Promise<Response>;
    scheduled: (event: unknown, env: unknown, ctx: { waitUntil: (task: Promise<void>) => void }) => Promise<void>;
  };
  const env = { DB: db, CLIENT_TOKEN: "client-secret", APPS_SCRIPT_URL: "https://script.test/exec",
    APPS_SCRIPT_TOKEN: "script-secret", ALLOWED_ORIGINS: "" };
  const tasks: Promise<void>[] = [];
  const ctx = { waitUntil: (task: Promise<void>) => { tasks.push(task); } };
  async function enqueue(event: Record<string, unknown>) {
    const request = new Request("https://worker.test/", {
      method: "POST", body: JSON.stringify({ action: "SYNC_STATE", token: "client-secret", event })
    });
    const response = await bridge.fetch(request, env, ctx);
    return response.json() as Promise<{ ok: boolean; result: { status: string } }>;
  }
  return { bridge, rows, env, ctx, tasks, enqueue, stats: () => ({ maxConcurrency, upstreamCalls }) };
}

describe("Worker scheduled outbox", () => {
  it("does not create more rows for identical Owlbear retries with new transport IDs", async () => {
    const test = harness();
    const projection = { version: 1, sourceId: "scene-1", sourceRevision: 12,
      factions: [{ factionId: "italy-side", country: "italy", hp: 25 }] };
    const first = await test.enqueue({ ...projection, eventId: "retry-1", createdAt: "first" });
    const second = await test.enqueue({ ...projection, eventId: "retry-2", createdAt: "second" });
    expect(first.result.status).toBe("QUEUED");
    expect(second.result.status).toBe("QUEUED");
    expect(test.rows.size).toBe(1);
    expect(test.stats().upstreamCalls).toBe(0);
    await test.enqueue({ ...projection, sourceRevision: 13, eventId: "next", createdAt: "third" });
    expect(test.rows.size).toBe(2);
  });

  it("keeps only one Apps Script writer even with overlapping cron invocations", async () => {
    const test = harness();
    await test.enqueue({ version: 1, sourceId: "scene", sourceRevision: 1, eventId: "a",
      factions: [{ factionId: "a", country: "italy", hp: 1 }] });
    await test.enqueue({ version: 1, sourceId: "scene", sourceRevision: 2, eventId: "b",
      factions: [{ factionId: "a", country: "italy", hp: 2 }] });
    await Promise.all([
      test.bridge.scheduled(null, test.env, test.ctx),
      test.bridge.scheduled(null, test.env, test.ctx)
    ]);
    await Promise.all(test.tasks);
    expect(test.rows.size).toBe(2);
    expect([...test.rows.values()].every(row => row.delivered_at !== null)).toBe(true);
    expect(test.stats()).toEqual({ maxConcurrency: 1, upstreamCalls: 2 });
  });
});
