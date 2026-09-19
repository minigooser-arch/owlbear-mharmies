import { copyFile, readdir, writeFile } from "node:fs/promises";
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
  backgroundJs: requireAsset(/^background-.*\.js$/, "background JS"),
  sdkAdapterJs: requireAsset(/^sdkAdapter-.*\.js$/, "SDK adapter JS"),
  turnScheduleJs: requireAsset(/^turnSchedule-.*\.js$/, "turn schedule JS"),
  localCloneJs: requireAsset(/^localCloneReconciler-.*\.js$/, "local clone reconciler JS")
};

// Every hashed asset name observed in a successful production Pages deploy since the first release.
// These aliases let an Owlbear iframe that still has an older index.html at least retrieve a valid asset
// instead of receiving a hard 404 after a newer GitHub Pages deployment replaces dist/.
const aliases = {
  popoverJs: [
    "popover-C1pHE-_U.js",
    "popover-jzQ5quiQ.js",
    "popover-BSdMMso-.js",
    "popover-D9JUV3dj.js",
    "popover-D5J07iIK.js",
    "popover-DCYe7aVg.js",
    "popover-DxCgbXcc.js",
    "popover-CYQunp37.js",
    "popover-R7OB8grq.js",
    "popover-CWaOHTEK.js",
    "popover-BPIcBEi5.js",
    "popover-tPvG_MHo.js",
    "popover-CmsXoGT7.js",
    "popover-W7qHHm3A.js",
    "popover-DPVNF0OH.js"
  ],
  popoverCss: [
    "popover-C07c0gpX.css",
    "popover-b8Y17HPz.css",
    "popover-DDHaCpnh.css",
    "popover-DO1xNcav.css",
    "popover-UyCKyqVx.css"
  ],
  backgroundJs: [
    "background-CHrT2CU_.js",
    "background-BgeoMLsM.js",
    "background-B3cweckT.js",
    "background-DKTpyEX2.js",
    "background-CpDh4Kmp.js",
    "background-D5tZ-m5K.js",
    "background-DLvhvBS1.js",
    "background-DgkKhKHi.js",
    "background-CUpljeQ-.js",
    "background--DuF8IMC.js",
    "background-nnzPXRXT.js",
    "background-CJc4glRm.js",
    "background-CLgr5z-H.js",
    "background-BwdVTWXB.js",
    "background-zS3bexv7.js",
    "background-I6X3Jvi5.js",
    "background-Dlqe0SPl.js"
  ],
  sdkAdapterJs: [
    "sdkAdapter-CgMHuryF.js",
    "sdkAdapter-DYcIy9CE.js",
    "sdkAdapter-CuKJpCEM.js",
    "sdkAdapter-CyHKEUgj.js",
    "sdkAdapter-Dgt7B6fu.js",
    "sdkAdapter-Cjuz5WJb.js",
    "sdkAdapter-D5qh1CTS.js",
    "sdkAdapter-CdQneGO2.js",
    "sdkAdapter-D7SDnR9X.js",
    "sdkAdapter-DQwHMO5Q.js",
    "sdkAdapter-Be5Q9KGo.js",
    "sdkAdapter-C2vf6Jkt.js"
  ],
  turnScheduleJs: [
    "turnSchedule-aemIDgUN.js",
    "turnSchedule-BSSoqZ0D.js",
    "turnSchedule-BlLmDJw7.js",
    "turnSchedule-DRMWE7lS.js",
    "turnSchedule-BoJjTCIg.js",
    "turnSchedule-ScyHLXt1.js",
    "turnSchedule-CebVj1fJ.js",
    "turnSchedule-7RPt0JfE.js"
  ],
  localCloneJs: [
    "localCloneReconciler-CKTjNxJa.js",
    "localCloneReconciler-DhJQ9tqJ.js",
    "localCloneReconciler-DBubb67A.js",
    "localCloneReconciler-DTKB4GzB.js",
    "localCloneReconciler-DlzUGaxr.js"
  ]
};

for (const [kind, names] of Object.entries(aliases)) {
  const source = current[kind];
  for (const name of names) {
    if (name === source) continue;
    await copyFile(resolve(assetsDir, source), resolve(assetsDir, name));
  }
}

// Early Vite builds emitted a standalone preload helper. Old HTML can still try to preload it.
// A harmless compatibility module prevents that request from becoming a 404.
const preloadCompat = [
  "const preload = (baseModule) => baseModule();",
  "export { preload as _, preload as __vitePreload };",
  ""
].join("\n");
for (const name of [
  "preload-helper-hUezBELj.js",
  "preload-helper-DT0Jyvs0.js",
  "preload-helper-DHDZuPZk.js"
]) {
  await writeFile(resolve(assetsDir, name), preloadCompat, "utf8");
}
