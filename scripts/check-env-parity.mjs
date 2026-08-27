#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
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
  throw new Error("check-env-parity.mjs has no automatic target");

const PLATFORM_KEYS = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "VERCEL",
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
]);
const sourcePattern = /\.(?:[cm]?[jt]sx?)$/;
const findings = [];

function maskComments(source) {
  let masked = "";
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        masked += "\n";
      } else {
        masked += " ";
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        masked += "  ";
        blockComment = false;
        index += 1;
      } else {
        masked += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote) {
      masked += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "/" && next === "/") {
      masked += "  ";
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      masked += "  ";
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    masked += char;
  }
  return masked;
}

function exampleKeys(files) {
  const keys = new Set();
  for (const file of files) {
    if (!existsSync(path.join(repoRoot, file))) continue;
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    for (const match of source.matchAll(
      /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm,
    )) {
      keys.add(match[1]);
    }
  }
  return keys;
}

const appDirectories = walkFiles("apps", (file) =>
  file.endsWith("/package.json"),
)
  .map((file) => path.posix.dirname(file))
  .sort();

for (const appDirectory of appDirectories) {
  const appName = path.posix.basename(appDirectory);
  const roots = [`${appDirectory}/src`, `${appDirectory}/app`].filter(
    (directory) => existsSync(path.join(repoRoot, directory)),
  );
  const sourceFiles = roots.flatMap((directory) =>
    walkFiles(
      directory,
      (file) =>
        sourcePattern.test(file) &&
        !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file),
    ),
  );
  const uses = new Map();
  for (const file of sourceFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    const code = maskComments(source);
    const patterns = [
      /process\.env\.([A-Z][A-Z0-9_]*)/g,
      /process\.env\[["']([A-Z][A-Z0-9_]*)["']\]/g,
    ];
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        if (PLATFORM_KEYS.has(match[1]) || uses.has(match[1])) continue;
        uses.set(match[1], { file, line: lineNumberAt(source, match.index) });
      }
    }

    for (const match of code.matchAll(
      /process\.env\.([A-Z][A-Z0-9_]*)\s*\?\?\s*process\.env\.([A-Z][A-Z0-9_]*)/g,
    )) {
      findings.push({
        file,
        line: lineNumberAt(source, match.index),
        message: `${match[1]} uses ?? before ${match[2]} without blank-normalizing the left operand`,
      });
    }
  }

  const examples = [
    `${appDirectory}/.env.example`,
    `${appDirectory}/LOCAL_ENV.example`,
  ];
  const documented = exampleKeys(examples);
  const existingExample = examples.find((file) =>
    existsSync(path.join(repoRoot, file)),
  );
  const desiredExample = existingExample ?? `${appDirectory}/.env.example`;

  for (const [key, location] of [...uses].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!documented.has(key)) {
      findings.push({
        ...location,
        message: `${key} is read by ${appName} but is missing from ${desiredExample}`,
      });
    }
    if (/_BACKEND_URL$/.test(key) && key !== "NEXT_PUBLIC_BACKEND_URL") {
      findings.push({
        ...location,
        message: `${key} is a non-canonical _BACKEND_URL alias; use NEXT_PUBLIC_BACKEND_URL with an explicit server-only boundary instead`,
      });
    }
  }

  const allKnown = new Set([...uses.keys(), ...documented]);
  for (const key of allKnown) {
    if (
      key.startsWith("NEXT_PUBLIC_") ||
      !/(?:SECRET|TOKEN|KEY|PLATFORMS|ALLOW)/.test(key)
    ) {
      continue;
    }
    const publicSibling = `NEXT_PUBLIC_${key}`;
    if (!allKnown.has(publicSibling)) continue;
    const location = uses.get(publicSibling) ??
      uses.get(key) ?? {
        file: desiredExample,
        line: 1,
      };
    findings.push({
      ...location,
      message: `${key} has security-sensitive material and must not have public sibling ${publicSibling}`,
    });
  }
}

reportFindings(findings, options);
