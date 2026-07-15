import { describe, expect, it } from "vitest";
import {
  addLeader,
  addMember,
  fourClientRoom,
  registerArmy,
  setRoute,
  startArmy
} from "./helpers/factories";
import { createFourClientRoom } from "./helpers/inMemoryAdapter";

describe("four-client room", () => {
  it("keeps C uninformed while A and B detect, move, collide, and enter battle", async () => {
    const room = createFourClientRoom();
    await room.registerArmies();
    room.setEnemy("A", "B");
    await room.setRoutesTowardEachOther(5);
    expect(await room.visibleTo("C")).toEqual(new Set(["c-army"]));
    room.globalStart();
    await room.advanceUntilContact();
    expect(await room.visibleTo("A")).toContain("b-army");
    expect(await room.visibleTo("B")).toContain("a-army");
    expect(await room.visibleTo("C")).toEqual(new Set(["c-army"]));
    expect(room.status("a-army")).toBe("IN_BATTLE");
    expect(room.status("b-army")).toBe("IN_BATTLE");
  });

  it("handles vision and movement barriers, reload, and coordinator loss", async () => {
    const room = createFourClientRoom();
    await room.registerArmies();
    room.setEnemy("A", "B");
    room.addVisionWall(2.5);
    expect(await room.visibleTo("A")).not.toContain("b-army");
    room.setVisionException("a-army", true);
    expect(await room.visibleTo("A")).toContain("b-army");
    expect(await room.reloadLocalClones("A")).toBe(2);
    expect(await room.reloadLocalClones("A")).toBe(2);
    await room.setRoutesTowardEachOther(5);
    room.addMovementWall(1);
    room.globalStart();
    await room.advance(1);
    expect(room.status("a-army")).toBe("PAUSED");
    room.loseCoordinator();
    expect(room.status("b-army")).toBe("PAUSED");
  });

  it("supports leaders, registration, private planning, and started-side visibility", async () => {
    const room = fourClientRoom();
    await room.gm.send(addLeader("red", "leader-1"));
    await room.gm.send(addLeader("red", "leader-2"));
    await room.leader1.send(addMember("red", "member"));
    await room.gm.send(registerArmy("red-token", "red"));
    await room.leader2.send(setRoute("red-token", [{ x: 2, y: 0 }]));

    expect(await room.gm.routeIds()).toContain("red-token");
    expect(await room.leader1.routeIds()).toContain("red-token");
    expect(await room.member.routeIds()).not.toContain("red-token");
    expect(await room.other.routeIds()).not.toContain("red-token");

    await room.gm.send(startArmy("red-token"));
    expect(await room.member.routeIds()).toContain("red-token");
    expect(await room.other.routeIds()).not.toContain("red-token");
  });
});
