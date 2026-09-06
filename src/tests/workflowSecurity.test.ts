import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const workflowsDirectory = fileURLToPath(new URL("../../.github/workflows/", import.meta.url));

function workflow(name: string): string {
  return readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), "utf8");
}

it("pins every external GitHub Action to an immutable 40-character commit SHA", () => {
  const workflowFiles = readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/.test(name));

  for (const name of workflowFiles) {
    const content = workflow(name);
    const usesLines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- uses:"));

    expect(usesLines.length, `${name} should contain external actions`).toBeGreaterThan(0);
    for (const line of usesLines) {
      expect(line, `${name}: ${line}`).toMatch(/^- uses: [^@\s]+@[0-9a-f]{40}(?:\s+#.*)?$/);
    }
  }
});

it("keeps the high-severity dependency audit ahead of the full check in CI and Pages deploy", () => {
  for (const name of ["ci.yml", "deploy-pages.yml"]) {
    const content = workflow(name);
    const auditIndex = content.indexOf("npm audit --audit-level=high");
    const checkIndex = content.indexOf("npm run check");

    expect(auditIndex, `${name} must run the high-severity audit`).toBeGreaterThanOrEqual(0);
    expect(checkIndex, `${name} must run the full project check`).toBeGreaterThan(auditIndex);
  }
});

it("prevents a manually dispatched Pages workflow from deploying a non-main ref", () => {
  const content = workflow("deploy-pages.yml");

  expect(content).toContain("if: github.ref == 'refs/heads/main'");
});

it("does not execute project dependencies with Pages write or OIDC permissions", () => {
  const content = workflow("deploy-pages.yml");
  const buildStart = content.indexOf("  build:\n");
  const deployStart = content.indexOf("  deploy:\n");

  expect(buildStart, "Pages workflow must have an unprivileged build job").toBeGreaterThanOrEqual(0);
  expect(deployStart, "Pages workflow must have a separate deploy job").toBeGreaterThan(buildStart);

  const buildBlock = content.slice(buildStart, deployStart);
  const deployBlock = content.slice(deployStart);

  expect(buildBlock).toContain("npm ci");
  expect(buildBlock).toContain("npm audit --audit-level=high");
  expect(buildBlock).toContain("npm run check");
  expect(buildBlock).not.toContain("pages: write");
  expect(buildBlock).not.toContain("id-token: write");

  expect(deployBlock).toContain("needs: build");
  expect(deployBlock).toContain("pages: write");
  expect(deployBlock).toContain("id-token: write");
  expect(deployBlock).not.toContain("npm ci");
  expect(deployBlock).not.toContain("npm run check");
});
