import { expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/constants";
import type { ArmyState, SceneItemRecord, SceneState } from "../shared/types";
import { buildRoleSafeSnapshot } from "./extensionServices";

const armyState = (sideId: string): ArmyState => ({
  version: 1, registered: true, sideId, status: "READY", overrides: {}, route: [], currentWaypointIndex: 0,
  segmentProgressCells: 0, ignoresMovementBarriers: false, ignoresVisionBarriers: false, revision: 1
});

it("builds a player snapshot whose visible IDs come from own side and local clones", () => {
  const scene: SceneState = {
    version: 2, revision: 1, settings: DEFAULT_SETTINGS,
    sides: [
      { id: "A", name: "Красные", color: "#f00", playerIds: ["player"], leaderPlayerIds: [] },
      { id: "B", name: "Синие", color: "#00f", playerIds: [], leaderPlayerIds: [] }
    ], relations: {}, battleGroups: []
  };
  const sourceA: SceneItemRecord = { id: "a", type: "IMAGE", name: "A", position: { x: 0, y: 0 }, metadata: {} };
  const sourceB: SceneItemRecord = { id: "b", type: "IMAGE", name: "B", position: { x: 1, y: 0 }, metadata: {} };
  const hidden: SceneItemRecord = { id: "hidden", type: "IMAGE", name: "Hidden", position: { x: 2, y: 0 }, metadata: {} };
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER", playerId: "player", scene,
    players: [{ id: "player", name: "Игрок", color: "#fff", role: "PLAYER", connected: true }],
    armies: [
      { item: sourceA, state: armyState("A") },
      { item: sourceB, state: armyState("B") },
      { item: hidden, state: armyState("B") }
    ],
    localCloneSourceIds: new Set(["b"])
  });
  expect(snapshot.visibleSourceIds).toEqual(new Set(["a", "b"]));
  expect(snapshot.memberSideIds).toEqual(new Set(["A"]));
  expect(snapshot.leaderSideIds).toEqual(new Set());
  expect(snapshot.players.map((player) => player.id)).toEqual(["player"]);
});

it("derives leader sides by internal id and hides legacy direct ownership", () => {
  const scene: SceneState = {
    version: 2,
    revision: 1,
    settings: DEFAULT_SETTINGS,
    sides: [{
      id: "A",
      name: "Красные",
      color: "#f00",
      playerIds: ["leader"],
      leaderPlayerIds: ["leader"]
    }],
    relations: {},
    battleGroups: []
  };
  const state = { ...armyState("A"), directOwnerPlayerId: "legacy-owner" };
  const snapshot = buildRoleSafeSnapshot({
    role: "PLAYER",
    playerId: "leader",
    scene,
    players: [
      { id: "leader", name: "Одинаковое имя", color: "#111", role: "PLAYER", connected: true },
      { id: "legacy-owner", name: "Одинаковое имя", color: "#222", role: "PLAYER", connected: true }
    ],
    armies: [{
      item: { id: "army", type: "IMAGE", position: { x: 0, y: 0 }, metadata: {} },
      state
    }],
    localCloneSourceIds: new Set()
  });

  expect(snapshot.leaderSideIds).toEqual(new Set(["A"]));
  expect(snapshot.armies[0]).not.toHaveProperty("directOwnerPlayerId");
});
