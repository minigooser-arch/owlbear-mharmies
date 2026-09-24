export interface ToolActivationPort {
  getActiveTool(): Promise<string>;
  getActiveToolMode(): Promise<string | undefined>;
}

export interface ActiveToolState {
  toolId: string;
  modeId: string | undefined;
}

export async function waitForToolActivation(
  port: ToolActivationPort,
  expectedToolId: string,
  expectedModeId: string,
  timeoutMs = 2_000,
  pollIntervalMs = 50
): Promise<ActiveToolState> {
  const deadline = Date.now() + timeoutMs;
  let active: ActiveToolState = {
    toolId: await port.getActiveTool(),
    modeId: await port.getActiveToolMode()
  };
  while (active.toolId !== expectedToolId || active.modeId !== expectedModeId) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return active;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
    const [toolId, modeId] = await Promise.all([
      port.getActiveTool(),
      port.getActiveToolMode()
    ]);
    active = { toolId, modeId };
  }
  return active;
}
