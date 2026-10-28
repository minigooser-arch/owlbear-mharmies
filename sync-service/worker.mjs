/**
 * Durable delivery bridge between Owlbear GM and the existing Apps Script.
 * Sheets remains the only authority for population, AW, AO and LR spending.
 * This worker never fetches private Owlbear scene data itself.
 */
function json(data, request, env, status = 200) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigin(origin, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedOrigin(origin, env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).includes(origin);
}

function authorized(payload, env) {
  return typeof payload.token === "string" && payload.token.length > 0 &&
    Boolean(env.CLIENT_TOKEN) && payload.token === env.CLIENT_TOKEN;
}

async function hashPayload(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function forward(env, payload) {
  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_TOKEN) throw new Error("UPSTREAM_NOT_CONFIGURED");
  const response = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, token: env.APPS_SCRIPT_TOKEN })
  });
  if (!response.ok) throw new Error("UPSTREAM_HTTP_" + response.status);
  const body = await response.json();
  if (!body || body.ok !== true) throw new Error("UPSTREAM_REJECTED:" + String(body?.error || "UNKNOWN"));
  return body;
}

async function queuedEvent(env, event) {
  if (!event || typeof event !== "object" || Array.isArray(event) || !event.eventId) {
    throw new Error("INVALID_SYNC_EVENT");
  }
  // The identity of a delivery includes the payload: a single client queue can
  // be split into independent HP/ship and 64-operation influence envelopes.
  const id = await hashPayload(event);
  const payload = JSON.stringify({ action: "SYNC_STATE", event });
  if (payload.length > 120_000) throw new Error("SYNC_EVENT_TOO_LARGE");
  await env.DB.prepare(
    "INSERT OR IGNORE INTO sync_outbox (id,payload,created_at,next_attempt_at) VALUES (?,?,?,?)"
  ).bind(id, payload, Date.now(), Date.now()).run();
  const record = await env.DB.prepare("SELECT delivered_at FROM sync_outbox WHERE id=?").bind(id).first();
  if (!record) throw new Error("SYNC_OUTBOX_WRITE_FAILED");
  return record.delivered_at == null ? "QUEUED" : "APPLIED";
}

async function drainOutbox(env, limit = 25) {
  for (let index = 0; index < limit; index++) {
    const now = Date.now();
    const candidate = await env.DB.prepare(
      "SELECT id,payload,attempts FROM sync_outbox WHERE delivered_at IS NULL AND next_attempt_at<=? AND lock_until<=? ORDER BY created_at,id LIMIT 1"
    ).bind(now, now).first();
    if (!candidate) break;
    const lease = await env.DB.prepare(
      "UPDATE sync_outbox SET lock_until=?,attempts=attempts+1 WHERE id=? AND delivered_at IS NULL AND lock_until<=?"
    ).bind(now + 120_000, candidate.id, now).run();
    if (lease.meta?.changes !== 1) continue;
    try {
      await forward(env, JSON.parse(candidate.payload));
      await env.DB.prepare(
        "UPDATE sync_outbox SET delivered_at=?,lock_until=0,last_error=NULL WHERE id=?"
      ).bind(Date.now(), candidate.id).run();
    } catch (error) {
      // Never silently discard a delivery, including after repeated failures.
      const attempts = Number(candidate.attempts || 0) + 1;
      const delay = Math.min(15 * 60_000, 5_000 * (2 ** Math.min(attempts, 8)));
      await env.DB.prepare(
        "UPDATE sync_outbox SET lock_until=0,next_attempt_at=?,last_error=? WHERE id=?"
      ).bind(Date.now() + delay, String(error instanceof Error ? error.message : error).slice(0, 200), candidate.id).run();
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigin(origin, env)) return json({ ok: false, error: "ORIGIN_FORBIDDEN" }, request, env, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": origin || "",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin"
      } });
    }
    if (request.method === "GET") return json({ ok: true, result: { service: "letopis-sync-bridge", version: 1 } }, request, env);
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, request, env, 405);
    let payload;
    try {
      const body = await request.text();
      if (body.length > 180_000) return json({ ok: false, error: "REQUEST_TOO_LARGE" }, request, env, 413);
      payload = JSON.parse(body);
    } catch {
      return json({ ok: false, error: "BAD_REQUEST" }, request, env, 400);
    }
    if (!payload || typeof payload !== "object" || !authorized(payload, env)) {
      return json({ ok: false, error: "UNAUTHORIZED" }, request, env, 401);
    }
    try {
      if (payload.action === "SYNC_STATE") {
        const status = await queuedEvent(env, payload.event);
        if (status === "QUEUED") ctx.waitUntil(drainOutbox(env));
        return json({ ok: true, result: { status } }, request, env);
      }
      if (payload.action === "SYNC_STATUS") {
        const status = await env.DB.prepare(
          "SELECT COUNT(*) AS pending,MIN(created_at) AS oldest FROM sync_outbox WHERE delivered_at IS NULL"
        ).first();
        return json({ ok: true, result: status }, request, env);
      }
      if (!["GET_STATES", "GET_FACTIONS", "SPEND_LR_BATCH", "ADJUST_MILITARY_INFLUENCE_BATCH"].includes(payload.action)) {
        return json({ ok: false, error: "UNKNOWN_ACTION" }, request, env, 400);
      }
      // Spending must receive the authoritative result synchronously.
      const { token: _discardSecret, ...forwarded } = payload;
      void _discardSecret;
      return json(await forward(env, forwarded), request, env);
    } catch (error) {
      // The caller may retry using the same stable request ID.
      return json({ ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 200) }, request, env, 503);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(drainOutbox(env, 100));
  }
};
