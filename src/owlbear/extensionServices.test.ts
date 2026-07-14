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
    armies: [
      { item: sourceA, state: armyState("A") },
      { item: sourceB, state: armyState("B") },
      { item: hidden, state: armyState("B") }
    ],
    localCloneSourceIds: new Set(["b"])
  });
  expect(snapshot.visibleSourceIds).toEqual(new Set(["a", "b"]));
});
