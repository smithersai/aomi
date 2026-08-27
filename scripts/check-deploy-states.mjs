#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  lineNumberAt,
  parseCommonArgs,
  repoRoot,
  reportFindings,
  walkFiles,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix)
  throw new Error("check-deploy-states.mjs has no mechanical fix");

const typesFile = "packages/deploy/src/types.ts";
const typesSource = readFileSync(path.join(repoRoot, typesFile), "utf8");
const unionMatch =
  /export\s+interface\s+DeploymentStatus\s*\{[\s\S]*?\bstate\s*:\s*([^;]+);/.exec(
    typesSource,
  );
if (!unionMatch)
  throw new Error(`Could not find DeploymentStatus.state in ${typesFile}`);
const states = [...unionMatch[1].matchAll(/["']([^"']+)["']/g)].map(
  (match) => match[1],
);
if (states.length === 0)
  throw new Error("DeploymentStatus.state has no literal members");

const sourceFiles = [
  "apps/portal/src/features/launch",
  "apps/build/src/features/launch",
].flatMap((directory) =>
  walkFiles(
    directory,
    (file) =>
      /\.[cm]?[jt]sx?$/.test(file) &&
      !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file),
  ),
);

const findings = [];
for (const file of sourceFiles) {
  const source = readFileSync(path.join(repoRoot, file), "utf8");
  const unsafe =
    /(?:status\.)?state\s*!==\s*["']ready["']\s*\)\s*(?:\{\s*)?setPhase\(\s*["']building["']\s*\)/g;
  for (const match of source.matchAll(unsafe)) {
    const collapsed = states.filter((state) => state !== "ready");
    findings.push({
      file,
      line: lineNumberAt(source, match.index),
      message: `non-ready deployment states (${collapsed.join(", ")}) collapse into the building phase; branch exhaustively on DeploymentStatus.state`,
    });
  }

  const unsafeDefault =
    /default\s*:\s*(?:\{[\s\S]{0,160}?)?setPhase\(\s*["'](?:building|releasing)["']\s*\)/g;
  for (const match of source.matchAll(unsafeDefault)) {
    findings.push({
      file,
      line: lineNumberAt(source, match.index),
      message: `default DeploymentStatus branch assigns an in-progress phase; enumerate ${states.join(", ")} and reject unknown states`,
    });
  }
}

reportFindings(findings, options);
