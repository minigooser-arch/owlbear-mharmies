import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OBR from "@owlbear-rodeo/sdk";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { createOwlbearExtensionServices } from "../owlbear/extensionServices";
import { App } from "./App";
import "./app.css";
import "./wiki-light.css";
import type { ExtensionServices, RawExtensionSnapshot } from "./state/useExtensionState";

const container = document.getElementById("root");

const initialSnapshot: RawExtensionSnapshot = {
  ready: false,
  sceneReady: false,
  futureSchema: false,
  role: "PLAYER",
  playerId: "",
  players: [],
  memberSideIds: new Set(),
  leaderSideIds: new Set(),
  mapVisibleSourceIds: new Set(),
  armies: [],
  sides: [],
  states: [],
  relations: {},
  battleGroups: [],
  settings: DEFAULT_SETTINGS,
  terrain: DEFAULT_TERRAIN,
  wars: [],
  turn: DEFAULT_TURN_STATE
};

const services: ExtensionServices = {
  getSnapshot: () => initialSnapshot,
  subscribe: () => () => undefined,
  send: async () => undefined,
  runDiagnostic: async () => undefined
};

if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>
  );
  OBR.onReady(() => {
    void createOwlbearExtensionServices().then((runningServices) => {
      root.render(
        <StrictMode>
          <App services={runningServices} />
        </StrictMode>
      );
    });
  });
}
