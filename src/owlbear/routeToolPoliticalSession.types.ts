import type { Side, StateEntity, StateRelations } from "../shared/types";

declare module "./routeToolIntegration" {
  interface RouteToolSession {
    sides: readonly Side[];
    states: readonly StateEntity[];
    stateRelations: StateRelations;
  }
}

export {};
