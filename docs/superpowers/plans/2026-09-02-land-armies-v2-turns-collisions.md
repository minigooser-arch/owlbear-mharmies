# Land Armies v2 Turns and Collisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make global turn transition apply disband/supply/HP/5-OP reset and automatically launch due routes together, and resolve all same-instant enemy contacts together.

**Architecture:** Replace the current simple `completeTurn` reset with a turn-transition domain service. Extend collision engine to return all contacts at earliest time and feed them to existing BattleGroup connected-component logic.

**Spec:** `docs/superpowers/specs/2026-09-02-land-armies-v2-design.md`

## Tasks

1. Route `executeOnTurn` and edit freeze rules.
2. Turn transition service with fixed 10 internal units, no accelerated movement.
3. Scheduler/manual completion use the same transition.
4. Auto-start all valid due routes.
5. Earliest-time collision batch + same-cell/swap strategic conflicts.
6. Stop all involved armies and zero remaining OP on battle creation.
7. Regression/integration verification.
