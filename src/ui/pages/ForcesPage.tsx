import type { Side, SideRelation, StrategicCity, TurnState } from "../../shared/types";
import type { ArmyView, NavalBattleRequestView, NavalRequestTargetView, ShipView, TransportEmbarkRequestView, TransportEmbarkTargetView, UiCommand } from "../state/useExtensionState";
import { ArmiesPage } from "./ArmiesPage";
import { FleetPage } from "./FleetPage";

export type ForcesSection = "ARMIES" | "FLEET";

export function ForcesPage({
  armies,
  ships,
  sides,
  role,
  playerId,
  strategicCities = [],
  leaderSideIds,
  relations = {},
  navalRequestTargets = [],
  pendingNavalBattleRequests = [],
  transportEmbarkTargets = [],
  pendingTransportEmbarkRequests = [],
  turnPhase,
  onAction
}: {
  armies: readonly ArmyView[];
  ships: readonly ShipView[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  playerId: string;
  strategicCities?: readonly StrategicCity[];
  leaderSideIds: ReadonlySet<string>;
  relations?: Readonly<Record<string, Readonly<Record<string, SideRelation>>>>;
  navalRequestTargets?: readonly NavalRequestTargetView[];
  pendingNavalBattleRequests?: readonly NavalBattleRequestView[];
  transportEmbarkTargets?: readonly TransportEmbarkTargetView[];
  pendingTransportEmbarkRequests?: readonly TransportEmbarkRequestView[];
  turnPhase?: TurnState["phase"];
  onAction(command: UiCommand): void;
}) {
  const [section, setSection] = useState<ForcesSection>("ARMIES");

  return (
    <section className="forces-center" aria-label="Войска">
      <nav className="forces-subnav" aria-label="Виды войск">
        <button type="button" aria-label="Армии" className={section === "ARMIES" ? "active" : ""} onClick={() => onSectionChange("ARMIES")}>
          Армии <span aria-hidden="true">{armies.length}</span>
        </button>
        <button type="button" aria-label="Флот" className={section === "FLEET" ? "active" : ""} onClick={() => onSectionChange("FLEET")}>
          Флот <span aria-hidden="true">{ships.length}</span>
        </button>
      </nav>
      {section === "ARMIES" ? (
        <ArmiesPage
          armies={armies}
          sides={sides}
          role={role}
          playerId={playerId}
          leaderSideIds={leaderSideIds}
          strategicCities={strategicCities}
          pendingTransportEmbarkRequests={pendingTransportEmbarkRequests}
          onAction={onAction}
        />
      ) : (
        <FleetPage
          ships={ships}
          armies={armies}
          sides={sides}
          role={role}
          leaderSideIds={leaderSideIds}
          strategicCities={strategicCities}
          relations={relations}
          navalRequestTargets={navalRequestTargets}
          pendingNavalBattleRequests={pendingNavalBattleRequests}
          transportEmbarkTargets={transportEmbarkTargets}
          turnPhase={turnPhase}
          onAction={onAction}
        />
      )}
    </section>
  );
}
