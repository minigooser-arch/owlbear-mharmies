import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk("src").filter((file) => /\.(ts|tsx)$/.test(file))) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (line.includes('"NAVAL_BATTLE"')) console.log(`${file}:${index + 1}:${line.trim()}`);
  });
}
