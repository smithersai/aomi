#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseCommonArgs, repoRoot, reportFindings } from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix) throw new Error("smoke-registry-install.mjs is report-only");

const baseRef = process.env.AOMI_REGISTRY_BASE_REF?.trim() || "origin/main";
const diff = spawnSync(
  "git",
  ["diff", "--name-only", baseRef, "--", "apps/shadcn-registry/src"],
  { cwd: repoRoot, encoding: "utf8" },
);
if (diff.status !== 0)
  throw new Error(`Could not diff registry against ${baseRef}`);
const changedFiles = diff.stdout
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((file) => file.replace(/^apps\/shadcn-registry\/src\//, ""));
if (changedFiles.length === 0) {
  reportFindings([], options);
  process.exit(0);
}

const registryIndex = JSON.parse(
  readFileSync(
    path.join(repoRoot, "apps/shadcn-registry/dist/registry.json"),
    "utf8",
  ),
);

const entries = changedFiles.includes("registry.ts")
  ? registryIndex.items
  : registryIndex.items.filter((entry) =>
      entry.files?.some((file) => changedFiles.includes(file.path)),
    );
const findings = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout)
      .trim()
      .split("\n")
      .slice(-4)
      .join(" | ");
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

if (entries.length > 0) {
  const scratch = mkdtempSync(path.join(tmpdir(), "aomi-registry-install-"));
  try {
    run(
      "npx",
      [
        "--yes",
        "create-next-app@latest",
        "app",
        "--typescript",
        "--tailwind",
        "--eslint",
        "--app",
        "--src-dir",
        "--use-pnpm",
        "--yes",
      ],
      scratch,
    );
    const app = path.join(scratch, "app");
    run("npx", ["--yes", "shadcn@latest", "init", "--defaults", "--yes"], app);
    for (const entry of entries) {
      run(
        "npx",
        [
          "--yes",
          "shadcn@latest",
          "add",
          `https://aomi.dev/r/${entry.name}.json`,
          "--yes",
          "--overwrite",
        ],
        app,
      );
    }
    run("pnpm", ["exec", "tsc", "--noEmit"], app);
    run("pnpm", ["exec", "next", "build"], app);
  } catch (error) {
    findings.push({
      file: "scripts/smoke-registry-install.mjs",
      line: 1,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

reportFindings(findings, options);
