# Land Armies v2 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add states, HP, supply/encirclement, annexation and player-requested disband to the current strategic army domain.

**Architecture:** Extend current versioned metadata and pure domain modules. Keep faction movement access independent from state ownership. Route all mutations through existing CommandProcessor/coordinator persistence.

**Tech Stack:** TypeScript, Vitest, Owlbear SDK, React.

**Spec:** `docs/superpowers/specs/2026-09-02-land-armies-v2-design.md`

## Tasks

1. Schema v5 / Army v3 migration and validation.
2. State territory and state-war rules.
3. HP + destruction + heal gate.
4. Supply BFS and encirclement calculation.
5. Annexation on actual cell entry.
6. Player/GM `REQUEST_ARMY_DISBAND` authorization and command.
7. UI state/army health/supply/disband status and GM state territory editing.
