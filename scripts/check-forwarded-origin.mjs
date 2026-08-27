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
  throw new Error("check-forwarded-origin.mjs has no mechanical fix");

const routeFiles = walkFiles("apps", (file) =>
  /\/app\/api\/.+\/route\.ts$/.test(file),
);
const findings = [];

function functionBounds(source, offset) {
  const prefix = source.slice(0, offset);
  const candidates = [
    ...prefix.matchAll(/function\s+(\w+)\s*\([^)]*\)[^{]*\{/g),
  ];
  const match = candidates.at(-1);
  if (!match) return null;
  const open = match.index + match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) {
      return { name: match[1], body: source.slice(open + 1, index) };
    }
  }
  return null;
}

for (const file of routeFiles) {
  const source = readFileSync(path.join(repoRoot, file), "utf8");
  if (
    !/(?:allowedCorsOrigin|isAllowedOrigin|Access-Control-Allow-Origin|access-control-allow-origin)/i.test(
      source,
    )
  ) {
    continue;
  }

  const reads = [
    ...source.matchAll(
      /headers\.get\(\s*["']x-forwarded-(?:host|proto)["']\s*\)/g,
    ),
  ];
  const reportedFunctions = new Set();
  for (const read of reads) {
    const owner = functionBounds(source, read.index);
    if (!owner || reportedFunctions.has(owner.name)) continue;
    const guarded =
      /(?:if\s*\(\s*|&&\s*)[A-Z][A-Z0-9_]*TRUST[A-Z0-9_]*[\s\S]{0,500}x-forwarded-(?:host|proto)/i.test(
        owner.body,
      );
    if (guarded) continue;
    reportedFunctions.add(owner.name);
    findings.push({
      file,
      line: lineNumberAt(source, read.index),
      message: `${owner.name} lets client-controlled X-Forwarded-Host/Proto participate in an origin allow-list without an explicit TRUST_* opt-in`,
    });
  }
}

reportFindings(findings, options);
