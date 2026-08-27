#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  lineNumberAt,
  parseCommonArgs,
  repoRoot,
  reportFindings,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix)
  throw new Error("check-openapi-fixture-union.mjs is report-only");

const baseRef = process.env.AOMI_OPENAPI_BASE_REF?.trim() || "origin/main";
const fixtureFiles = [
  "packages/client/test/fixtures/backend-openapi.json",
  "packages/client/test/fixtures/manager-openapi.json",
];
const methods = ["get", "post", "put", "patch", "delete"];
const findings = [];

function fromGit(ref, file) {
  const result = spawnSync("git", ["show", `${ref}:${file}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? JSON.parse(result.stdout) : null;
}

function operations(document) {
  const result = new Map();
  for (const [route, item] of Object.entries(document.paths ?? {})) {
    for (const method of methods) {
      if (!item?.[method]) continue;
      result.set(`${method.toUpperCase()} ${route}`, item[method]);
    }
  }
  return result;
}

function commitBodies() {
  const result = spawnSync("git", ["log", "--format=%B", `${baseRef}..HEAD`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout : "";
}

function hasRemovalNote(body, key, operationId) {
  return body
    .split("\n")
    .filter((line) => /^\s*Removed\s*:/i.test(line))
    .some(
      (line) =>
        line.includes(key) || (operationId && line.includes(operationId)),
    );
}

function resolvePointer(document, reference) {
  if (!reference.startsWith("#/")) return true;
  let current = document;
  for (const rawSegment of reference.slice(2).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!current || typeof current !== "object" || !(segment in current))
      return false;
    current = current[segment];
  }
  return true;
}

function refs(value, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) refs(item, result);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") result.push(item);
      else refs(item, result);
    }
  }
  return result;
}

const removalNotes = commitBodies();
const currentFixtures = new Map();
for (const file of fixtureFiles) {
  const source = readFileSync(path.join(repoRoot, file), "utf8");
  const current = JSON.parse(source);
  const previous = fromGit(baseRef, file);
  currentFixtures.set(file, { source, document: current });

  for (const reference of new Set(refs(current))) {
    if (!resolvePointer(current, reference)) {
      findings.push({
        file,
        line: lineNumberAt(source, source.indexOf(`"${reference}"`)),
        message: `dangling OpenAPI reference ${reference}`,
      });
    }
  }

  if (!previous) continue;
  const before = operations(previous);
  const after = operations(current);
  for (const [key, operation] of before) {
    const next = after.get(key);
    const operationId = operation.operationId;
    if (!next && !hasRemovalNote(removalNotes, key, operationId)) {
      findings.push({
        file,
        line: 1,
        message: `${key} disappeared from the fixture without a "Removed:" commit-body note`,
      });
      continue;
    }
    if (
      next &&
      operationId &&
      next.operationId !== operationId &&
      !hasRemovalNote(removalNotes, key, operationId)
    ) {
      findings.push({
        file,
        line: lineNumberAt(
          source,
          source.indexOf(`"${key.slice(key.indexOf(" ") + 1)}"`),
        ),
        message: `${key} dropped operationId ${operationId} without a "Removed:" commit-body note`,
      });
    }
    if (
      next &&
      JSON.stringify(operation["x-aomi-auth"]) !==
        JSON.stringify(next["x-aomi-auth"])
    ) {
      findings.push({
        file,
        line: lineNumberAt(
          source,
          source.indexOf(`"${key.slice(key.indexOf(" ") + 1)}"`),
        ),
        message: `${key} changed x-aomi-auth from ${JSON.stringify(operation["x-aomi-auth"])} to ${JSON.stringify(next["x-aomi-auth"])}`,
      });
    }
  }
}

const backend = operations(currentFixtures.get(fixtureFiles[0]).document);
const manager = operations(currentFixtures.get(fixtureFiles[1]).document);
for (const [key, managerOperation] of manager) {
  const backendOperation = backend.get(key);
  if (
    backendOperation &&
    JSON.stringify(backendOperation["x-aomi-auth"]) !==
      JSON.stringify(managerOperation["x-aomi-auth"])
  ) {
    findings.push({
      file: fixtureFiles[1],
      line: 1,
      message: `${key} has conflicting x-aomi-auth between backend and manager fixtures`,
    });
  }
}

reportFindings(findings, options);
