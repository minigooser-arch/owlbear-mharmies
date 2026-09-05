import fs from "node:fs";

function replaceOnce(path, before, after) {
  let text = fs.readFileSync(path, "utf8");
  if (!text.includes(before)) throw new Error(`${path}: anchor missing`);
  text = text.replace(before, after);
  fs.writeFileSync(path, text);
}

replaceOnce(
  "src/commands/commandProcessor.ts",
  `    private readonly shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,\n    private readonly shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false\n  ) {}`,
  `    private readonly shoreBombardmentDistanceCells: (from: GridCellCoord, to: GridCellCoord) => number = () => Number.POSITIVE_INFINITY,\n    private readonly shoreBombardmentHasLineOfSight: (from: GridCellCoord, to: GridCellCoord) => boolean = () => false,\n    private readonly shoreBombardmentWindowOpen: () => boolean = () => false\n  ) {}`
);

replaceOnce(
  "src/commands/commandProcessor.ts",
  `        const activeBattle = state.scene.activeNavalBattle?.status === "ACTIVE"\n          ? state.scene.activeNavalBattle\n          : undefined;\n        const result = commitShoreBombardment({`,
  `        const activeBattle = state.scene.activeNavalBattle?.status === "ACTIVE"\n          ? state.scene.activeNavalBattle\n          : undefined;\n        if (!activeBattle && !this.shoreBombardmentWindowOpen()) {\n          return "SHORE_BOMBARDMENT_WINDOW_CLOSED";\n        }\n        const result = commitShoreBombardment({`
);
