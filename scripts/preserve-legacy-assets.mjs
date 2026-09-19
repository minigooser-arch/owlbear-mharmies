import { copyFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const assetsDir = resolve("dist/assets");
const files = await readdir(assetsDir);

function requireAsset(pattern, label) {
  const match = files.find((name) => pattern.test(name));
  if (!match) throw new Error(`Missing built ${label} asset`);
  return match;
}

const current = {
  popoverJs: requireAsset(/^popover-.*\.js$/, "popover JS"),
  popoverCss: requireAsset(/^popover-.*\.css$/, "popover CSS"),
  backgroundJs: requireAsset(/^background-.*\.js$/, "background JS")
};

const aliases = {
  popoverJs: [
    "popover-C1pHE-_U.js",
    "popover-jzQ5quiQ.js",
    "popover-BSdMMso-.js",
    "popover-D9JUV3dj.js",
    "popover-D5J07iIK.js",
    "popover-DCYe7aVg.js",
    "popover-CYQunp37.js",
    "popover-CWaOHTEK.js",
    "popover-BPIcBEi5.js",
    "popover-tPvG_MHo.js",
    "popover-CmsXoGT7.js"
  ],
  popoverCss: [
    "popover-C07c0gpX.css",
    "popover-b8Y17HPz.css",
    "popover-DDHaCpnh.css"
  ],
  backgroundJs: [
    "background-CHrT2CU_.js",
    "background-BgeoMLsM.js",
    "background-B3cweckT.js",
    "background-DKTpyEX2.js",
    "background-D5tZ-m5K.js",
    "background-DgkKhKHi.js",
    "background-nnzPXRXT.js",
    "background-CJc4glRm.js",
    "background-CLgr5z-H.js",
    "background-BwdVTWXB.js",
    "background-zS3bexv7.js"
  ]
};

for (const [kind, names] of Object.entries(aliases)) {
  const source = current[kind];
  for (const name of names) {
    if (name === source) continue;
    await copyFile(resolve(assetsDir, source), resolve(assetsDir, name));
  }
}
