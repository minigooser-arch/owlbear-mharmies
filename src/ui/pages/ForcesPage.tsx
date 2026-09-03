import { useState } from "react";
import type { Side } from "../../shared/types";
import type { ArmyView, ShipView, UiCommand } from "../state/useExtensionState";
import { ArmiesPage } from "./ArmiesPage";
import { FleetPage } from "./FleetPage";

type ForcesSection = "ARMIES" | "FLEET";

export function ForcesPage({
  armies,
  ships,
  sides,
  role,
  playerId,
  leaderSideIds,
  memberSideIds,
  onAction
}: {
  armies: readonly ArmyView[];
  ships: readonly ShipView[];
  sides: readonly Side[];
  role: "GM" | "PLAYER";
  playerId: string;
  leaderSideIds: ReadonlySet<string>;
  memberSideIds: ReadonlySet<string>;
  onAction(command: UiCommand): void;
}) {
  const [section, setSection] = useState<ForcesSection>("ARMIES");

  return (
    <section className="forces-center" aria-label="Войска">
      <nav className="forces-subnav" aria-label="Виды войск">
        <button type="button" aria-label="Армии" className={section === "ARMIES" ? "active" : ""} onClick={() => setSection("ARMIES")}>
          Армии <span aria-hidden="true">{armies.length}</span>
        </button>
        <button type="button" aria-label="Флот" className={section === "FLEET" ? "active" : ""} onClick={() => setSection("FLEET")}>
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
          memberSideIds={memberSideIds}
          onAction={onAction}
        />
      ) : (
        <FleetPage
          ships={ships}
          armies={armies}
          sides={sides}
          role={role}
          leaderSideIds={leaderSideIds}
          onAction={onAction}
        />
      )}
    </section>
  );
}
