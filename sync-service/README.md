# Letopis Sheet Sync Bridge (Cloudflare Worker + D1)

Durable delivery bridge for **aggregate** Owlbear HP, ship totals and military-influence operations. It cannot fetch private Owlbear scene state while all GMs are offline. Once a GM sends an event to D1, the bridge retries it without a GM connection.

The Google Sheet and its Apps Script remain the only authority for population, LR capacity (AW), available LR (AO) and expenses. The separate population-growth Apps Script is **not modified**.

## Setup

1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and create a Cloudflare account/project with D1.
2. In `sync-service/`, copy `wrangler.toml.example` to `wrangler.toml`.
3. Run `wrangler d1 create letopis-sync-outbox`, then paste the returned `database_id` into the TOML. Never commit generated secrets.
4. Run `wrangler d1 execute letopis-sync-outbox --remote --file=./schema.sql` from `sync-service/`.
5. Set secrets with `wrangler secret put CLIENT_TOKEN`, `wrangler secret put APPS_SCRIPT_URL`, and `wrangler secret put APPS_SCRIPT_TOKEN`. `CLIENT_TOKEN` is a **new** random GM-to-bridge secret; the other two are the existing Apps Script /exec URL and WRITEBACK_TOKEN.
6. Restrict `ALLOWED_ORIGINS` to the published Owlbear extension origin. Run `wrangler deploy` from `sync-service/` and verify its cron trigger.
7. In Owlbear scene settings change `sheetWritebackUrl` to the new Worker URL and store the **new CLIENT_TOKEN** in each GM browser's writeback-token field.
8. Verify HP, ship-only events, deleted-faction HP, military influence, and failures in **staging** before production cutover.

## API and delivery contract

POST requests use the existing JSON protocol and `Content-Type: text/plain;charset=utf-8`; the caller must send `token` with `CLIENT_TOKEN`. The bridge proxies `GET_STATES`, `GET_FACTIONS`, `SPEND_LR_BATCH`, and `ADJUST_MILITARY_INFLUENCE_BATCH` directly to Apps Script with its server-side token.

`SYNC_STATE` is first stored in D1 using the hash of the **entire** event (separate HP/ship and influence chunks thus have separate IDs). It replies `QUEUED` before delivery or `APPLIED` after confirmation. Owlbear keeps the local queue while the response says `QUEUED`. The bridge retries during cron executions even after all GMs disconnect.

For monitoring, POST `{"action":"SYNC_STATUS","token":"..."}` and examine the pending count and oldest event timestamp. Never log or commit secrets.

## Operational limits

- The bridge can deliver previously captured events without a GM, but cannot discover new private Owlbear units without an active client. Truly server-authoritative state requires a different architecture.
- LR expenses are synchronously forwarded with requestId deduplication, but the existing crash gap between external expense and Owlbear game-save needs an additional recoverable transaction protocol.
- Deploy a matching sourceId/revision-aware Apps Script version before cutting over Owlbear. Do not modify the independent population-growth script.
- One Owlbear scene may write to one Sheets backend. Apps Script binds the first source ID; scene migration must be an audited manual operation that also resets the `OWLBEAR_SYNC_SOURCE_ID` and `OWLBEAR_SYNC_LAST_REVISION` properties.
- Deployments, D1, cron, and the new Worker URL require Cloudflare credentials. Merely merging this repository does not enable autonomous delivery.