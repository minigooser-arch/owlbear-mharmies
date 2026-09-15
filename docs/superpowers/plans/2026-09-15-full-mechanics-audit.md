# Full Mechanics Audit Plan

**Branch:** `feature/full-mechanics-audit`  
**Base:** `main@fb47107957418399d72cce4cd6cee0d7791d4ec5`

## Goal

Audit every gameplay and infrastructure mechanic in the plugin against the existing specifications and current runtime behavior. The audit is not a passive code review: every discovered gap must be converted into a regression test, reproduced RED, fixed minimally, and verified GREEN before the change is considered resolved.

## Audit protocol for every mechanic

For each block below:

1. Read the relevant design/plan documents and identify authoritative rules.
2. Trace the full runtime path: UI/tool → command/validation/authorization → domain logic → persistence → snapshot/UI.
3. Inventory existing tests and map them to required invariants.
4. Check:
   - happy path;
   - rejection/permission path;
   - boundary values;
   - stale/retry/idempotence behavior;
   - persistence and reload;
   - simultaneous/concurrent operations where relevant;
   - cross-mechanic interactions;
   - GM vs player visibility/authorization.
5. Add missing regression tests before changing behavior.
6. Confirm RED for a real defect or uncovered rule.
7. Apply the smallest compatible fix.
8. Run focused tests, then `npm run check`.
9. Record findings in the audit log section of this document.
10. Only merge audited fixes into `main` after fresh CI success.

## Audit blocks

### A. Baseline, schema and command boundary
- latest schema/version/protocol consistency;
- metadata repository CAS/revision semantics;
- validation fail-closed behavior;
- unknown/future schema rejection;
- obsolete commands rejected;
- role-safe snapshots do not leak GM-only state;
- persistence round-trip for all current persisted entities.

### B. Factions, leaders, membership and permissions
- side creation/update/delete;
- player membership and leader lists;
- leader-only vs faction-member vs GM-only commands;
- deleted side cleanup across armies, ships, relations and state rulership;
- sender/connection spoofing protection;
- leader/member visibility in UI.

### C. Army registration and lifecycle
- register/unregister;
- duplicate registration;
- invalid image/item registration;
- READY/MOVING/PAUSED/IN_BATTLE state transitions;
- destruction at 0 HP;
- disband request/confirmation lifecycle;
- cleanup of routes, battle references and overlays.

### D. Army health and healing
- damage clamping;
- healing clamping;
- destroyed armies cannot heal;
- unsupplied/encircled armies cannot heal;
- GM/editor HP changes;
- health overlay synchronization.

### E. Strategic grid and terrain
- cell coordinate conversion/snap;
- terrain registry CRUD and default terrain invariants;
- movement cost;
- impassable cells;
- land/sea movement domains;
- deleting/replacing terrain types;
- terrain brush preserving political layers.

### F. Barriers
- barrier creation/edit/delete;
- geometric intersection rules;
- movement and vision barriers independently;
- overlays/local cleanup;
- invalid/stale barrier references.

### G. Route planning and route tools
- orthogonal strategic routes;
- movement-cost calculation;
- route truncation;
- invalidation/replan after terrain/political changes;
- route context menu/tool state;
- route overlay lifecycle;
- planning must never mutate diplomacy.

### H. Land movement execution
- interpolation and strategic progress;
- movement points consumed correctly;
- start/pause/resume/stop;
- final-cell handling;
- stale revisions;
- failure rollback;
- deterministic stepwise authoritative entry.

### I. Land collisions and BattleGroup lifecycle
- earliest collision detection;
- simultaneous movers;
- battle group creation/join;
- movement stops and remaining points become zero;
- battle cleanup;
- no occupation beyond collision point;
- unrelated armies remain unaffected.

### J. States and state invariants
- active state ruler invariant;
- faction→state membership via `Side.stateId`;
- state CRUD;
- state deletion references;
- deactivating ruler state on side deletion;
- invalid/missing/inactive political configuration fails closed.

### K. Interstate diplomacy
- directional military access;
- symmetric exact-pair war;
- no third-state leakage;
- GM-only diplomacy mutations;
- ending war preserves passage;
- legacy WarState never authorizes runtime movement/annexation.

### L. Political movement and immediate invasion war
- ruler own/pass/war/unowned entry;
- non-ruler denial of closed neutral border;
- non-ruler may use existing passage/war;
- stateless faction restrictions;
- ruler entering closed foreign recognized territory declares exact-pair war only on actual entered cell;
- repeated entry idempotence;
- command and live movement paths behave identically.

### M. Forced withdrawal
- passage revoked;
- war ended;
- recognized border changed;
- activation on next turn;
- shortest-exit BFS;
- all equal shortest paths accepted;
- longer/forged route denied;
- multi-turn withdrawal;
- battle can interrupt legal withdrawal;
- withdrawal does not redeclare war;
- legality restoration clears forced exit.

### N. Occupation, annexation and recapture
- only ruling faction armies change de-facto control;
- exact-pair war required;
- recognized owner never changes through occupation;
- stepwise capture only for reached cells;
- recapture own recognized land;
- repeated recapture;
- neutral third-party land not captured accidentally;
- city de-facto control updates from cells.

### O. Supply
- recognized home territory with no override supplies;
- own de-facto occupation can extend chain;
- enemy occupation cuts chain;
- passage never carries supply;
- no diagonal supply;
- deterministic path;
- embarked army behavior;
- local-only supply overlay;
- large/pathological map bounds.

### P. Encirclement
- unsupplied army damage = `max(1, ceil(maxHp*0.10))`;
- exactly once per checkpoint;
- zero HP uses normal destruction;
- movement/attack allowed;
- healing denied;
- no effect before supply checkpoint;
- retry after partial persistence does not double-hit.

### Q. Strategic cities
- CRUD;
- unique nonempty cells;
- valid state references;
- manual historical build count;
- all-cell controller resolver;
- city metadata preserved on occupation/transfer;
- capital and faction influence stored without inventing extra gameplay.

### R. Territorial war score
- city income formula;
- fully held enemy city only;
- exact-pair active war only;
- directional A→B and A→C pools;
- mixed control no income;
- lost city stops future gain;
- peace preserves accumulated score;
- retry idempotence.

### S. Peace territory transfer
- arbitrary selected cells;
- selected only;
- recognized + de-facto normalization;
- no occupation prerequisite;
- full multi-cell city required;
- strategic city ownership update;
- no diplomacy/score/rebellion side effects;
- GM confirmation and preview overlay.

### T. Rebellions
- immutable recognized-territory snapshot;
- capital reference;
- participant validation;
- capital controller by physical presence;
- multiple internal sides → no controller;
- strength counts participant armies inside snapshot only;
- close preserves history.

### U. Civil war split
- atomic state creation;
- rebel faction becomes ruler;
- only fully influenced city cell sets transfer;
- ordinary cells stay successor;
- armies/positions/HP/routes unchanged;
- exact-pair war starts immediately;
- failed validation causes no partial mutation;
- command/UI confirmation path.

### V. Global turn lifecycle
- movement phase open/close;
- completion blockers individually;
- land and naval battle guard;
- forced-exit/supply/encirclement/score stages;
- fixed checkpoint order;
- checkpoint partial-retry idempotence;
- automatic turn scheduling/pause/defer/resume;
- manual renumbering invariants;
- stale checkpoint handling.

### W. Visibility and local clones
- faction/GM visibility;
- detection graph;
- army local clone reconciliation;
- planned facing/route visibility;
- deletion cleanup;
- no hidden-state leaks through snapshots.

### X. Ship registration and ship lifecycle
- allowed item/class registration;
- unique occupied-cell rule;
- damage/destruction;
- active ship rules;
- side deletion cleanup;
- strategic turn reset;
- class stats and overrides.

### Y. Naval strategic movement
- route planning;
- movement phase execution;
- occupied-cell collision rejection;
- final turn behavior;
- no unintended automatic fleet battle;
- terrain/SEA restrictions;
- movement persistence and retry.

### Z. Naval detection and visibility
- detection distance;
- line of sight;
- reveal windows;
- overrides;
- hidden enemy ship snapshots;
- stale reveal cleanup;
- local overlays.

### AA. Naval battle request and area selection
- request authorization;
- target/detection requirements;
- GM approval/rejection;
- area tool;
- request expiry;
- start persistence;
- participants snapshot;
- duplicate/stale request handling.

### AB. Naval battle lifecycle
- initiative;
- round advancement;
- per-ship turn;
- tactical movement budget;
- broadside targeting/mask/LOS;
- action usage;
- exit;
- destroyed active ship handling;
- completion and history;
- strategic turn cannot advance during active battle.

### AC. Cruiser interception
- eligibility;
- detection/visibility requirements;
- interception context menu;
- battle-end cleanup;
- no stale interception state.

### AD. Naval transport
- embark request/consent;
- capacity/eligibility;
- embarked army state;
- supply while genuinely embarked;
- disembark/landing validation;
- destroyed/missing carrier edge cases;
- side and turn restrictions.

### AE. Hospital support
- eligible ship/class;
- range and target rules;
- healing restrictions;
- no healing destroyed/encircled armies when applicable;
- duplicate use/action budget rules.

### AF. Shore bombardment
- firing window;
- class/action eligibility;
- range;
- LOS;
- target visibility;
- damage and action consumption;
- battle vs strategic mode boundaries.

### AG. Owlbear runtime, coordinator and concurrency
- coordinator lease/election;
- only coordinator runs authoritative ticks;
- command ACK/replay behavior;
- scene/item revision CAS;
- failed scene/item writes rollback safely;
- subscription refresh;
- local overlay ownership/cleanup;
- concurrent command stale-revision rejection.

### AH. UI and UX authorization
- GM-only pages/actions;
- player leader/member surfaces;
- no hidden admin controls;
- disabled/invalid states explain reasons;
- current domain state reflected after refresh;
- removed legacy faction-territory/War UI does not reappear.

### AI. Migrations and backward compatibility
- every supported old schema migration;
- v5 turn phase regression;
- legacy faction territory readable but inert;
- unambiguous two-state war migration only;
- multi-party legacy war does not become all-vs-all;
- naval data retained;
- future schema rejected;
- idempotent read/write normalization.

### AJ. Cross-mechanic end-to-end scenarios
- invasion → war → occupation → supply cut → encirclement → score → peace → forced exit → transfer;
- battle collision during invasion;
- passage revoke during deployed armies;
- civil war while existing diplomacy exists;
- naval battle + land checkpoint coexistence;
- side/state deletion with live strategic entities;
- save/reload mid-flow;
- repeated coordinator/checkpoint execution.

### AK. Final release gate
- static search for deprecated runtime policy;
- full tests;
- typecheck;
- lint;
- production build;
- high-severity npm audit;
- fresh CI on audit branch;
- compare against main and merge only audited commits.

## Audit log

Audit findings are appended here as work progresses. Each entry records: block, finding, RED evidence, fix commit, focused tests, full CI result.
