import { describe, expect, it } from "vitest";
import { METADATA_KEYS } from "../shared/constants";
import { uiMetadataSignature } from "./uiMetadataSignature";

const base = {
  [METADATA_KEYS.scene]: {
    version: 5,
    revision: 10,
    sides: [{ id: "red", name: "Red" }],
    coordinatorLease: { connectionId: "gm-1", epoch: 1, expiresAt: 1000 }
  },
  [METADATA_KEYS.gridManifest]: { version: 2, revision: 3, partCount: 1 },
  [METADATA_KEYS.lrLedgerManifest]: { version: 1, revision: 8 },
  [METADATA_KEYS.sheetWritebackQueue]: { pending: { eventId: "first" } }
};

describe("uiMetadataSignature", () => {
  it("ignores heartbeat-only updates and independent sheet writeback queue traffic", () => {
    const next = {
      ...base,
      [METADATA_KEYS.scene]: {
        ...base[METADATA_KEYS.scene],
        coordinatorLease: { connectionId: "gm-1", epoch: 2, expiresAt: 2000 }
      },
      [METADATA_KEYS.sheetWritebackQueue]: { pending: { eventId: "second" } }
    };
    expect(uiMetadataSignature(base)).toBe(uiMetadataSignature(next));
  });

  it("detects game changes even if an old producer did not bump revision", () => {
    const next = {
      ...base,
      [METADATA_KEYS.scene]: {
        ...base[METADATA_KEYS.scene],
        sides: [{ id: "red", name: "Updated" }]
      }
    };
    expect(uiMetadataSignature(base)).not.toBe(uiMetadataSignature(next));
  });

  it("detects changes to chunk manifests independent of scene metadata", () => {
    const next = {
      ...base,
      [METADATA_KEYS.gridManifest]: { version: 2, revision: 4, partCount: 1 }
    };
    expect(uiMetadataSignature(base)).not.toBe(uiMetadataSignature(next));
  });

  it("handles unavailable scene data without throwing", () => {
    expect(uiMetadataSignature({})).toBeTypeOf("string");
    expect(uiMetadataSignature({ [METADATA_KEYS.scene]: null })).toBeTypeOf("string");
  });
});
