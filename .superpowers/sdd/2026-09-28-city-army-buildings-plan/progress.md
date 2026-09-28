# SDD ledger — plan: docs/superpowers/plans/2026-09-28-city-army-buildings-plan.md

Setup: implementation runs inline in the current user-approved branch; no subagents are used.
Pre-flight: Task 1 produces schema and ledger primitives consumed by Tasks 2–6; Task 2 produces city/building predicates consumed by Tasks 3–5; Task 3 produces army lifecycle fields consumed by Tasks 4–6. No conflicts found against the specification.

Task 1: complete (pending commit). Tests: `npm.cmd run typecheck`; `npm.cmd test -- --run src/finance/lrLedger.test.ts src/storage/cityArmyBuildingsMigration.test.ts src/storage/migrations.test.ts src/storage/navalMigrations.test.ts` — pass.
Task 2: complete (pending commit). Tests: `npm.cmd run typecheck`; `npm.cmd test -- --run src/cities/cityBuildingRules.test.ts src/cities/strategicCities.test.ts src/commands/strategicCityCommands.test.ts` — pass.
Task 3: complete (pending commit). Tests: `npm.cmd run typecheck`; focused formation/health/command tests — pass.
Task 4: partial. Railway endpoint and pure city/naval effects are implemented and tested; transport/visibility/coastal retaliation integrations remain.
Regression suite after Task 3: 290 files / 1339 tests pass after updating v8 expectations.
Task 5/6: selected-token city/army commands, GM-only LR snapshot, settings rates, formation UI state, and city building removal controls wired; full UI polish and ledger page remain out of scope for this pass.
Continuation: added GM LR ledger page with recorded-state command and city building add/remove controls. Full regression: 290 files / 1339 tests; production build, dist verification, and smoke test pass.
Final mechanics pass: added one-turn supply grace, port embark/disembark movement costs, sea-fort landing denial, canal dual-domain support, lighthouse detection, shipyard class-aware repair, marine/naval building predicates.
Verification after final mechanics: full suite and production build rerun; shipyard test corrected to class maximum HP.
Coastal battery retaliation is now connected to successful enemy shore bombardment: 2d6 damage reduced by ship armor, with destruction routed through naval lifecycle cleanup.
Marine-station route crossing is connected to land-route validation for one sea cell between land cells.
Continuation: added leader/GM shipyard repair UI and authoritative `REPAIR_SHIP_AT_SHIPYARD` command; added hospital selection and city lock for discounted healing; exposed leader city-army and shipyard registration flows from the selected token; applied Bunkering Station +2 OP at turn reset and route-resolution validation; included strategic cities and LR transactions in semantic snapshots.
Documentation: added `docs/global-map-player-guide.md` and linked it from `README.md`.
Selected-token city creation now sends the strategic `CREATE_STRATEGIC_CITY_FROM_TOKEN` command and no longer requires manual cell entry; city and shipyard panels are exposed in the player forces UI.
Final verification: `npm.cmd test -- --run` — 291 files / 1341 tests passed; `npm.cmd run typecheck` — passed; `npm.cmd run lint` — passed; `npm.cmd run build` — passed with dist verification and smoke test.
