export interface ToolActivationPort {
  getActiveTool(): Promise<string>;
  getActiveToolMode(): Promise<string | undefined>;
}

export interface ToolActivationCommandPort extends ToolActivationPort {
  activateTool(toolId: string): Promise<void>;
  activateMode(toolId: string, modeId: string): Promise<void>;
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

export async function activateToolMode(
  port: ToolActivationCommandPort,
  toolId: string,
  modeId: string,
  timeoutMs = 2_000,
  pollIntervalMs = 50
): Promise<ActiveToolState> {
  let activeTool = await port.getActiveTool();
  if (activeTool !== toolId) await port.activateTool(toolId);
  const toolDeadline = Date.now() + timeoutMs;
  while (activeTool !== toolId) {
    const remaining = toolDeadline - Date.now();
    if (remaining <= 0) {
      return { toolId: activeTool, modeId: await port.getActiveToolMode() };
    }
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
    activeTool = await port.getActiveTool();
  }

  // Owlbear may resolve activateTool before it has changed the active tool.
  // Activating the mode before that transition completes is ignored.
  await port.activateMode(toolId, modeId);
  return waitForToolActivation(port, toolId, modeId, timeoutMs, pollIntervalMs);
}
