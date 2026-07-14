import { describe, expect, it } from "vitest";
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
});
