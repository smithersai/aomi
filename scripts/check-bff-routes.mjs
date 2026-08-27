#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  lineNumberAt,
  parseCommonArgs,
  repoRoot,
  reportFindings,
  walkFiles,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
const routeFiles = ["apps/portal/src/app/api", "apps/build/src/app/api"]
  .flatMap((directory) =>
    walkFiles(directory, (file) => file.endsWith("/route.ts")),
  )
  .sort();
const bffFiles = ["apps/portal/src/server/bff", "apps/build/src/server/bff"]
  .flatMap((directory) =>
    walkFiles(directory, (file) => /\/routes\.ts$/.test(file)),
  )
  .sort();

const NODE_ONLY_IMPORT =
  /(?:from\s+|import\s*)["'](?:@portal\/server\/|@build\/server\/|@\/server\/|@aomi-labs\/(?:account|service|deploy)(?:\/|["'])|node:|pg["'])/;
const NODE_RUNTIME = /export\s+const\s+runtime\s*=\s*["']nodejs["']\s*;/;

function runtimeFindings() {
  const findings = [];
  for (const file of routeFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    if (!NODE_ONLY_IMPORT.test(source) || NODE_RUNTIME.test(source)) continue;
    findings.push({
      file,
      line: 1,
      message:
        'route imports Node-only server code but does not declare export const runtime = "nodejs"',
      kind: "runtime",
    });
  }
  return findings;
}

function insertRuntime(file) {
  const absolute = path.join(repoRoot, file);
  const source = readFileSync(absolute, "utf8");
  const lines = source.split("\n");
  let lastImportLine = -1;
  let inImport = false;

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!inImport && trimmed.startsWith("import ")) inImport = true;
    if (inImport) {
      lastImportLine = index;
      if (trimmed.endsWith(";")) inImport = false;
      continue;
    }
    if (lastImportLine >= 0 && trimmed !== "") break;
  }

  if (lastImportLine < 0) {
    throw new Error(`Cannot find the import block in ${file}`);
  }
  lines.splice(lastImportLine + 1, 0, "", 'export const runtime = "nodejs";');
  writeFileSync(absolute, lines.join("\n"));
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return index;
  }
  return -1;
}

function originGuardFindings() {
  const findings = [];
  for (const file of bffFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    const factoryPattern = /export\s+function\s+(\w+Route)\s*\([^)]*\)\s*\{/g;
    for (const match of source.matchAll(factoryPattern)) {
      const openIndex = match.index + match[0].lastIndexOf("{");
      const closeIndex = matchingBrace(source, openIndex);
      if (closeIndex < 0) continue;
      const body = source.slice(openIndex + 1, closeIndex);
      const writeHandler =
        /return\s+async\s+function\s+(?:POST|PUT|PATCH|DELETE)\b/.exec(body);
      if (!writeHandler) continue;

      const backendIndex = body.search(
        /\b(?:backendClient|backendRequest)\s*\(/,
      );
      if (backendIndex < 0) continue;
      const beforeBackend = body.slice(0, backendIndex);
      const directlyGuarded = /validateOrigin\s*\(/.test(beforeBackend);
      const localHelperGuarded = [
        ...beforeBackend.matchAll(/\b(\w+)\s*\(\s*req\b/g),
      ]
        .map((helper) => helper[1])
        .some((helper) => {
          const helperPattern = new RegExp(
            `(?:function|const)\\s+${helper}\\b[\\s\\S]{0,500}?validateOrigin\\s*\\(`,
          );
          return helperPattern.test(source);
        });
      const importedAuthorizeGuarded =
        /\bauthorize\s*\(\s*req\s*,\s*\{[\s\S]*?write\s*:\s*true/.test(
          beforeBackend,
        ) &&
        /import\s+\{[^}]*\bauthorize\b[^}]*\}\s+from\s+["']@build\/server\/bff\/auth["']/.test(
          source,
        );

      if (directlyGuarded || localHelperGuarded || importedAuthorizeGuarded) {
        continue;
      }
      findings.push({
        file,
        line: lineNumberAt(source, match.index),
        message: `${match[1]} performs backend I/O for a write handler before a validateOrigin guard`,
        kind: "origin",
      });
    }
  }
  return findings;
}

let findings = [...runtimeFindings(), ...originGuardFindings()];
if (options.fix) {
  for (const finding of findings.filter(
    (finding) => finding.kind === "runtime",
  )) {
    insertRuntime(finding.file);
  }
  findings = [...runtimeFindings(), ...originGuardFindings()];
}

reportFindings(
  findings.map(({ kind: _kind, ...finding }) => finding),
  options,
);
