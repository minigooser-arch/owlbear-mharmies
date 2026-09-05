import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
let replacements = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const matches = before.match(/"NAVAL_BATTLE"/g)?.length ?? 0;
  if (matches === 0) continue;
  const after = before.replaceAll('"NAVAL_BATTLE"', '"POST_MOVEMENT"');
  fs.writeFileSync(file, after);
  replacements += matches;
}

if (replacements !== 27) {
  throw new Error(`Expected 27 NAVAL_BATTLE phase literals, replaced ${replacements}`);
}
console.log(`Replaced ${replacements} global phase literals with POST_MOVEMENT`);
