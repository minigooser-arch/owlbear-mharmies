import { describe, expect, it } from "vitest";
import type { SceneItemRecord, Vector2 } from "../shared/types";
import { DiagnosticsService, type DiagnosticsPort } from "./diagnostics";

class DiagnosticsHarness implements DiagnosticsPort {
  source: SceneItemRecord = {
    id: "source",
    type: "IMAGE",
    position: { x: 10, y: 20 },
    metadata: {}
  };
  locals = new Map<string, SceneItemRecord>();
  counter = 1;
  contextSupported = true;

  async getSelectedSource() { return structuredClone(this.source); }
  async getSource() { return structuredClone(this.source); }
  async createTemporaryLocal(source: SceneItemRecord) {
    const item = { ...structuredClone(source), id: "temporary" };
    this.locals.set(item.id, item);
    return item.id;
  }
  async updateTemporaryLocal(id: string, position: Vector2) {
    const item = this.locals.get(id);
    if (item) item.position = { ...position };
  }
  async deleteLocalItems(ids: readonly string[]) { ids.forEach((id) => this.locals.delete(id)); }
  async updateSourcePosition(_id: string, position: Vector2) { this.source.position = { ...position }; }
  async readBackgroundCounter() { return this.counter; }
  async probeContextMenu() { return this.contextSupported; }
}

describe("live diagnostics", () => {
  it("restores source position and removes temporary local items after a probe", async () => {
    const harness = new DiagnosticsHarness();
    const original = structuredClone(harness.source.position);
    const service = new DiagnosticsService(harness);
    expect(await service.run("SOURCE_UPDATE")).toMatchObject({ status: "PASS" });
    expect(harness.source.position).toEqual(original);
    expect([...harness.locals.values()]).toEqual([]);
  });

  it("classifies an unsupported local context menu as an SDK limitation", async () => {
    const harness = new DiagnosticsHarness();
    harness.contextSupported = false;
    expect(await new DiagnosticsService(harness).run("CONTEXT_MENU")).toMatchObject({
      status: "SDK_LIMITATION"
    });
  });

  it("requires the background counter to increase after reopening", async () => {
    const harness = new DiagnosticsHarness();
    const service = new DiagnosticsService(harness);
    expect(await service.beginBackgroundProbe()).toEqual({ status: "WAITING", testId: "BACKGROUND" });
    expect(await service.finishBackgroundProbe()).toMatchObject({ status: "FAIL" });
    harness.counter += 2;
    expect(await service.finishBackgroundProbe()).toMatchObject({ status: "PASS" });
  });

  it("cleans up temporary items even when an SDK operation throws", async () => {
    const harness = new DiagnosticsHarness();
    harness.updateTemporaryLocal = async () => { throw new Error("SDK failed"); };
    const result = await new DiagnosticsService(harness).run("LOCAL_CHANGE");
    expect(result).toMatchObject({ status: "FAIL", detail: "SDK failed" });
    expect(harness.locals.size).toBe(0);
  });
});
