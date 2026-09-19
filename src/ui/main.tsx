import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OBR from "@owlbear-rodeo/sdk";
import { DEFAULT_SETTINGS, DEFAULT_TERRAIN, DEFAULT_TURN_STATE } from "../shared/constants";
import { createOwlbearExtensionServices } from "../owlbear/extensionServicesV7";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import "./app.css";
import "./wiki-light.css";
import "./fleet.css";
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
  ships: [],
  sides: [],
  states: [],
  relations: {},
  stateRelations: {},
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
  const renderApp = (nextServices: ExtensionServices) => {
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <App services={nextServices} />
        </AppErrorBoundary>
      </StrictMode>
    );
  };

  renderApp(services);

  OBR.onReady(() => {
    void createOwlbearExtensionServices()
      .then((runningServices) => {
        renderApp(runningServices);
      })
      .catch((error: unknown) => {
        console.error("[Letopis Armies] Failed to initialize popover services", error);
        root.render(
          <main className="state-screen warning" role="alert">
            Не удалось запустить интерфейс расширения. Закройте и снова откройте панель. Если ошибка повторится, проверьте консоль браузера.
          </main>
        );
      });
  });
}
