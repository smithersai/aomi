#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

import {
  lineNumberAt,
  parseCommonArgs,
  repoRoot,
  reportFindings,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix)
  throw new Error("check-registry-integrity.mjs has no single safe fix");

const registryFile = "apps/shadcn-registry/src/registry.ts";
const builderFile = "apps/shadcn-registry/scripts/build-registry.js";
const mirrorDirectory = "apps/landing/public/r";
const registrySource = readFileSync(path.join(repoRoot, registryFile), "utf8");
const builderSource = readFileSync(path.join(repoRoot, builderFile), "utf8");
const findings = [];

function closingDelimiter(source, openIndex, open = "{", close = "}") {
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
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index;
  }
  return -1;
}

function arrayProperty(block, property) {
  const propertyMatch = new RegExp(`\\b${property}\\s*:`).exec(block);
  if (!propertyMatch) return [];
  const valueOffset = propertyMatch.index + propertyMatch[0].length;
  const tail = block.slice(valueOffset).trimStart();
  if (tail.startsWith("[")) {
    const open = block.indexOf("[", valueOffset);
    const close = closingDelimiter(block, open, "[", "]");
    return stringLiterals(block.slice(open + 1, close));
  }
  const literal = /^\s*["']([^"']+)["']/.exec(block.slice(valueOffset));
  return literal ? [literal[1]] : [];
}

function stringLiterals(source) {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function parseEntries() {
  const declaration = registrySource.indexOf("export const registry");
  const assignment = registrySource.indexOf("=", declaration);
  const arrayOpen = registrySource.indexOf("[", assignment);
  const arrayClose = closingDelimiter(registrySource, arrayOpen, "[", "]");
  if (declaration < 0 || assignment < 0 || arrayOpen < 0 || arrayClose < 0) {
    throw new Error(`Could not parse registry entries from ${registryFile}`);
  }
  const entries = [];
  let index = arrayOpen + 1;
  while (index < arrayClose) {
    const open = registrySource.indexOf("{", index);
    if (open < 0 || open >= arrayClose) break;
    const close = closingDelimiter(registrySource, open);
    if (close < 0)
      throw new Error(
        `Unclosed registry entry at ${registryFile}:${lineNumberAt(registrySource, open)}`,
      );
    const block = registrySource.slice(open, close + 1);
    const name = /\bname\s*:\s*["']([^"']+)["']/.exec(block)?.[1];
    if (name) {
      entries.push({
        name,
        files: arrayProperty(block, "file"),
        dependencies: arrayProperty(block, "dependencies"),
        line: lineNumberAt(registrySource, open),
      });
    }
    index = close + 1;
  }
  return entries;
}

const entries = parseEntries();

const functionStart = builderSource.indexOf("function resolveFileType");
const functionOpen = builderSource.indexOf("{", functionStart);
const functionClose = closingDelimiter(builderSource, functionOpen);
if (functionStart < 0 || functionClose < 0) {
  throw new Error(`Could not load resolveFileType from ${builderFile}`);
}
const resolveFileType = vm.runInNewContext(
  `(${builderSource.slice(functionStart, functionClose + 1)})`,
  Object.create(null),
);
const wrongLib = [];
const wrongHooks = [];
for (const file of entries.flatMap((entry) => entry.files)) {
  const actual = resolveFileType(file);
  if (file.startsWith("lib/") && actual !== "registry:lib") wrongLib.push(file);
  if (file.startsWith("hooks/") && actual !== "registry:hook")
    wrongHooks.push(file);
}
if (wrongLib.length > 0 || wrongHooks.length > 0) {
  const line = lineNumberAt(
    builderSource,
    builderSource.indexOf('filePath.includes("/hooks/")'),
  );
  findings.push({
    file: builderFile,
    line,
    message: `resolveFileType misclassifies ${wrongLib.length} root-relative lib/ path${wrongLib.length === 1 ? "" : "s"} and ${wrongHooks.length} hooks/ path${wrongHooks.length === 1 ? "" : "s"}; use startsWith checks as well as nested-path checks`,
  });
}

function barePackage(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("http:") ||
    specifier.startsWith("https:")
  ) {
    return null;
  }
  if (specifier.startsWith("@"))
    return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function dependencyPackage(dependency) {
  if (!dependency.startsWith("@")) return dependency.split("@")[0];
  const slash = dependency.indexOf("/");
  const versionAt = dependency.indexOf("@", slash);
  return versionAt < 0 ? dependency : dependency.slice(0, versionAt);
}

const IMPORT_EXPORT_RE =
  /(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g;
const builtinExemptions = new Set(["react", "react-dom", "next"]);
for (const entry of entries) {
  const imported = new Set();
  for (const file of entry.files) {
    const absolute = path.join(repoRoot, "apps/shadcn-registry/src", file);
    let source;
    try {
      source = readFileSync(absolute, "utf8");
    } catch {
      findings.push({
        file: registryFile,
        line: entry.line,
        message: `${entry.name} references missing registry source ${file}`,
      });
      continue;
    }
    for (const match of source.matchAll(IMPORT_EXPORT_RE)) {
      const packageName = barePackage(match[1]);
      if (packageName) imported.add(packageName);
    }
  }
  const declared = new Set(entry.dependencies.map(dependencyPackage));
  const missing = [...imported].filter(
    (packageName) =>
      !declared.has(packageName) &&
      !builtinExemptions.has(packageName) &&
      !packageName.startsWith("@aomi-labs/"),
  );
  if (missing.length > 0) {
    findings.push({
      file: registryFile,
      line: entry.line,
      message: `${entry.name} has bare imports missing from dependencies: ${missing.sort().join(", ")}`,
    });
  }
  for (const dependency of entry.dependencies) {
    if (
      dependencyPackage(dependency) === "@assistant-ui/react" &&
      dependency === "@assistant-ui/react"
    ) {
      findings.push({
        file: registryFile,
        line: entry.line,
        message: `${entry.name} must range-pin @assistant-ui/react in the registry dependency string`,
      });
    }
  }
}

function filesBelow(directory) {
  const result = [];
  const visit = (current, prefix = "") => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) visit(path.join(current, entry.name), relative);
      else result.push(relative);
    }
  };
  visit(directory);
  return result.sort();
}

const temporary = mkdtempSync(path.join(tmpdir(), "aomi-registry-"));
try {
  const generatedDirectory = path.join(temporary, "dist");
  const temporaryBuilder = path.join(temporary, "build-registry.mjs");
  const adjustedBuilder = builderSource
    .replace(
      'import { registry } from "../src/registry.js";',
      `import { registry } from ${JSON.stringify(pathToFileURL(path.join(repoRoot, registryFile)).href)};`,
    )
    .replace(
      'const distDir = path.resolve(baseDir, "../dist");',
      `const distDir = ${JSON.stringify(generatedDirectory)};`,
    )
    .replace(
      'const srcDir = path.resolve(baseDir, "../src");',
      `const srcDir = ${JSON.stringify(path.join(repoRoot, "apps/shadcn-registry/src"))};`,
    );
  writeFileSync(temporaryBuilder, adjustedBuilder);
  const build = spawnSync(process.execPath, [temporaryBuilder], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    findings.push({
      file: builderFile,
      line: 1,
      message: `fresh registry build failed: ${(build.stderr || build.stdout).trim().split("\n").at(-1)}`,
    });
  } else {
    const mirror = path.join(repoRoot, mirrorDirectory);
    const generatedFiles = filesBelow(generatedDirectory);
    const mirrorFiles = filesBelow(mirror);
    const generatedSet = new Set(generatedFiles);
    const mirrorSet = new Set(mirrorFiles);
    const missing = generatedFiles.filter((file) => !mirrorSet.has(file));
    const extra = mirrorFiles.filter((file) => !generatedSet.has(file));
    const changed = generatedFiles.filter(
      (file) =>
        mirrorSet.has(file) &&
        !readFileSync(path.join(generatedDirectory, file)).equals(
          readFileSync(path.join(mirror, file)),
        ),
    );
    if (missing.length > 0 || extra.length > 0 || changed.length > 0) {
      findings.push({
        file: mirrorDirectory,
        line: 1,
        message: `registry mirror differs from a fresh build (missing: ${missing.length}, extra: ${extra.length}, changed: ${changed.length})`,
      });
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

reportFindings(findings, options);
