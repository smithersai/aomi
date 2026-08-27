#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseCommonArgs,
  repoRoot,
  reportFindings,
  walkFiles,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix) throw new Error("check-provider-sdk-dupes.mjs is report-only");

const watched = [
  "@privy-io/react-auth",
  "@privy-io/wagmi",
  "@getpara/react-sdk",
  "@getpara/web-sdk",
  "@getpara/react-core",
  "wagmi",
  "viem",
  "@tanstack/react-query",
  "@solana/wallet-adapter-react",
];
const lockFile = "pnpm-lock.yaml";
const lockSource = readFileSync(path.join(repoRoot, lockFile), "utf8");
const packageSection = lockSource.split(/^snapshots:\s*$/m)[0];

const manifests = [
  "apps/shadcn-registry/package.json",
  ...walkFiles("apps", (file) => file.endsWith("/package.json")),
].filter((file, index, files) => files.indexOf(file) === index);
const consumers = manifests
  .map((file) => ({
    file,
    manifest: JSON.parse(readFileSync(path.join(repoRoot, file), "utf8")),
  }))
  .filter(
    ({ file, manifest }) =>
      file === "apps/shadcn-registry/package.json" ||
      manifest.dependencies?.["@aomi-labs/widget-lib"] !== undefined,
  );

if (
  !consumers.some(({ file }) => file === "apps/shadcn-registry/package.json") ||
  consumers.length < 2
) {
  reportFindings([], options);
  process.exit(0);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function installedVersions(packageName) {
  const pattern = new RegExp(
    `^  ['\"]?${escapeRegExp(packageName)}@(\\d+\\.\\d+\\.\\d+(?:-[^:'\"]+)?)['\"]?:`,
    "gm",
  );
  const versions = new Map();
  for (const match of packageSection.matchAll(pattern)) {
    if (!versions.has(match[1])) {
      versions.set(
        match[1],
        packageSection.slice(0, match.index).split("\n").length,
      );
    }
  }
  return versions;
}

const findings = [];
for (const packageName of watched) {
  const versions = installedVersions(packageName);
  const groups = new Set(
    [...versions].map(([version]) => {
      const [major, minor] = version.split(".").map(Number);
      return packageName.startsWith("@getpara/")
        ? `${major}.${minor}`
        : `${major}`;
    }),
  );
  if (groups.size < 2) continue;

  const declarations = consumers
    .flatMap(({ file, manifest }) => {
      const range =
        manifest.dependencies?.[packageName] ??
        manifest.peerDependencies?.[packageName] ??
        manifest.devDependencies?.[packageName];
      return range === undefined ? [] : [`${file} (${range})`];
    })
    .join(", ");
  const line = Math.min(...versions.values());
  findings.push({
    file: lockFile,
    line,
    message: `${packageName} resolves to incompatible installed versions ${[...versions.keys()].join(", ")} across widget-lib and rendering apps${declarations ? `; direct declarations: ${declarations}` : ""}`,
  });
}

reportFindings(findings, options);
