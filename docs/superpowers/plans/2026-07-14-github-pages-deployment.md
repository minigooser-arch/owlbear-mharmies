# GitHub Pages Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Owlbear Rodeo extension from `main` to `https://minigooser-arch.github.io/owlbear-mharmies/` through GitHub Actions and expose a verified HTTPS manifest URL.

**Architecture:** Vite builds both extension entrypoints with the GitHub project-path base. A GitHub Pages workflow runs the complete project check, uploads `dist`, and deploys it with the official Pages actions. The source branch remains free of generated build output.

**Tech Stack:** Git 2.55, GitHub CLI 2.96, Node.js 24, npm, Vite 8, GitHub Actions, GitHub Pages.

## Global Constraints

- Repository: `https://github.com/minigooser-arch/owlbear-mharmies`.
- Branch: `main`; the user explicitly approved direct publication to this empty repository.
- Pages base path: `/owlbear-mharmies/`.
- Manifest URL: `https://minigooser-arch.github.io/owlbear-mharmies/manifest.json`.
- Use official GitHub Pages actions and store no credentials in project files.
- Do not report deployment success until the public HTTPS URLs return successful responses.

---

### Task 1: Project-path build and Owlbear manifest

**Files:**
- Modify: `vite.config.ts`
- Modify: `public/manifest.json`
- Modify: `README.md`
- Create: `src/tests/deploymentConfig.test.ts`

**Interfaces:**
- Consumes: repository name `owlbear-mharmies` and the current multi-page Vite inputs.
- Produces: project-relative asset URLs and absolute Owlbear entrypoint URLs.

- [ ] **Step 1: Write the failing deployment configuration test**

```ts
import { expect, it } from "vitest";
import manifest from "../../public/manifest.json";
import viteConfig from "../../vite.config";

it("targets the owlbear-mharmies GitHub Pages project path", () => {
  expect(viteConfig.base).toBe("/owlbear-mharmies/");
  expect(manifest.action.popover).toBe(
    "https://minigooser-arch.github.io/owlbear-mharmies/index.html"
  );
  expect(manifest.background_url).toBe(
    "https://minigooser-arch.github.io/owlbear-mharmies/background.html"
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm.cmd test -- src/tests/deploymentConfig.test.ts`

Expected: FAIL because `viteConfig.base` is absent and manifest URLs still begin at `/`.

- [ ] **Step 3: Configure Vite and manifest**

Add `base: "/owlbear-mharmies/"` to the exported Vite config. Set manifest `icon`, `action.icon`, `action.popover`, and `background_url` to absolute URLs under `https://minigooser-arch.github.io/owlbear-mharmies/`.

Update the README local URL to `http://localhost:5173/owlbear-mharmies/manifest.json` and add the production manifest URL.

- [ ] **Step 4: Verify the build output uses the project path**

Run: `npm.cmd test -- src/tests/deploymentConfig.test.ts && npm.cmd run build`

Expected: PASS; `dist/index.html` and `dist/background.html` reference `/owlbear-mharmies/assets/`, and `dist/manifest.json` contains the public HTTPS entrypoints.

- [ ] **Step 5: Commit**

```powershell
git add vite.config.ts public/manifest.json README.md src/tests/deploymentConfig.test.ts
git commit -m "build: configure GitHub Pages base path"
```

### Task 2: GitHub Pages workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `npm ci`, `npm run check`, and generated `dist/`.
- Produces: a Pages deployment on every push to `main` and manual dispatch.

- [ ] **Step 1: Create the workflow**

```yaml
name: Deploy GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate workflow and run the full local gate**

Run: `npm.cmd run check`

Expected: typecheck, lint, all Vitest tests, and Vite build exit 0.

- [ ] **Step 3: Commit the workflow and remaining project files**

```powershell
git add .github .gitignore README.md background.html docs eslint.config.js index.html package.json package-lock.json public src tsconfig.app.json tsconfig.json tsconfig.node.json vite.config.ts
git commit -m "feat: publish Letopis Armies extension"
```

### Task 3: Authenticate, push, and verify Pages

**Files:**
- No project file changes expected.

**Interfaces:**
- Consumes: local `main`, configured `origin`, GitHub browser authentication.
- Produces: public repository contents, successful Pages workflow, public manifest URL.

- [ ] **Step 1: Authenticate with the browser flow**

Run: `gh auth login --hostname github.com --git-protocol https --web`

Expected: GitHub opens a browser/device flow and `gh auth status` identifies `minigooser-arch`.

- [ ] **Step 2: Push the empty repository's first history**

Run: `git push -u origin main`

Expected: new branch `main` is created on `origin` without force.

- [ ] **Step 3: Enable workflow-based Pages if necessary**

Run: `gh api --method POST repos/minigooser-arch/owlbear-mharmies/pages -f build_type=workflow`

Expected: Pages configuration exists. Treat HTTP 409/422 indicating it already exists as a signal to query and verify the current `build_type` rather than retry blindly.

- [ ] **Step 4: Watch the deployment workflow**

Run: `gh run list --repo minigooser-arch/owlbear-mharmies --workflow deploy-pages.yml --limit 1`, followed by `gh run watch <run-id> --exit-status`.

Expected: conclusion `success`.

- [ ] **Step 5: Verify public assets**

Request all of:

```text
https://minigooser-arch.github.io/owlbear-mharmies/manifest.json
https://minigooser-arch.github.io/owlbear-mharmies/index.html
https://minigooser-arch.github.io/owlbear-mharmies/background.html
https://minigooser-arch.github.io/owlbear-mharmies/icon.svg
```

Expected: successful HTTP responses; manifest entrypoints match those URLs, and HTML asset links include `/owlbear-mharmies/assets/`.

- [ ] **Step 6: Report the Owlbear installation URL**

Provide `https://minigooser-arch.github.io/owlbear-mharmies/manifest.json` and note that live-room diagnostics remain user-run checks.

