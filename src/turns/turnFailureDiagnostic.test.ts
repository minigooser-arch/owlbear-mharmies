import { describe, expect, it } from "vitest";
import { describeTurnFailure, readTurnFailureDiagnostic } from "./turnFailureDiagnostic";
import { uiMetadataSignature } from "../owlbear/uiMetadataSignature";
import { METADATA_KEYS } from "../shared/constants";

describe("turn failure persistence", () => {
  it("captures a short error code and stage, not the exception stack", () => {
    const error = Object.assign(new Error("Internal stack"), { code: "GRID_CHUNK_WRITE_FAILED" });
    const info = describeTurnFailure(8, "PERSISTENCE", error, new Date("2026-10-28T15:00:00Z"));
    expect(info).toEqual({ turnNumber: 8, stage: "PERSISTENCE", code: "GRID_CHUNK_WRITE_FAILED",
      at: "2026-10-28T15:00:00.000Z" });
    expect(readTurnFailureDiagnostic(info)).toEqual(info);
  });

  it("redacts URLs and tokens before storing in shared scene metadata", () => {
    const info = describeTurnFailure(8, "GET_STATES",
      new Error("Fetch https://example.test/?token=mysecret authorization:abc123 failed"), new Date());
    expect(info.code).not.toContain("mysecret");
    expect(info.code).not.toContain("abc123");
  });

  it("rejects malformed diagnostics", () => {
    expect(readTurnFailureDiagnostic({ turnNumber: "8", stage: "PERSISTENCE", code: "x", at: "now" })).toBeUndefined();
    expect(readTurnFailureDiagnostic({ turnNumber: 8, stage: "UNKNOWN", code: "x", at: "now" })).toBeUndefined();
  });

  it("detects diagnostic changes while still ignoring coordinator heartbeat", () => {
    const scene = { revision: 3, coordinatorLease: { connectionId: "gm", epoch: 1, expiresAt: 20 } };
    const metadata = { [METADATA_KEYS.scene]: scene };
    const signature = uiMetadataSignature(metadata);
    expect(uiMetadataSignature({ [METADATA_KEYS.scene]: {
      ...scene, coordinatorLease: { connectionId: "gm", epoch: 2, expiresAt: 30 }
    } })).toBe(signature);
    expect(uiMetadataSignature({ ...metadata, [METADATA_KEYS.turnFailureDiagnostic]: {
      turnNumber: 8, stage: "PERSISTENCE", code: "SAVE_FAILED", at: "2026-10-28T15:00:00.000Z"
    } })).not.toBe(signature);
  });
});
