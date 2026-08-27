#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  lineNumberAt,
  parseCommonArgs,
  repoRoot,
  reportFindings,
  walkFiles,
} from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix) throw new Error("check-publish-coherence.mjs is report-only");

const baseRef = process.env.AOMI_PUBLISH_BASE_REF?.trim() || "origin/main";
const manifestFiles = [
  ...walkFiles("packages", (file) => file.endsWith("/package.json")),
  "apps/shadcn-registry/package.json",
];

function manifestAt(ref, file) {
  const result = spawnSync("git", ["show", `${ref}:${file}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return JSON.parse(result.stdout);
}

function currentManifest(file) {
  return JSON.parse(readFileSync(path.join(repoRoot, file), "utf8"));
}

const packages = manifestFiles
  .map((file) => ({ file, manifest: currentManifest(file) }))
  .filter(
    ({ manifest }) =>
      manifest.private !== true && manifest.name && manifest.version,
  );
const bumped = packages.filter(({ file, manifest }) => {
  const previous = manifestAt(baseRef, file);
  return previous === null || previous.version !== manifest.version;
});
const findings = [];

for (const changed of bumped) {
  for (const consumer of packages) {
    if (consumer.file === changed.file) continue;
    const pins = {
      ...consumer.manifest.dependencies,
      ...consumer.manifest.peerDependencies,
      ...consumer.manifest.optionalDependencies,
    };
    if (pins[changed.manifest.name] === undefined) continue;
    const previousConsumer = manifestAt(baseRef, consumer.file);
    if (previousConsumer?.version === consumer.manifest.version) {
      findings.push({
        file: consumer.file,
        line: 1,
        message: `${consumer.manifest.name} pins bumped package ${changed.manifest.name} but its own version did not move from ${consumer.manifest.version}`,
      });
    }
  }
}

function semverParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  return match
    ? {
        core: match.slice(1, 4).map(Number),
        prerelease: match[4]?.split(".") ?? [],
      }
    : null;
}

function compareVersions(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length;
  }
  return left.localeCompare(right, undefined, { numeric: true });
}

async function registryVersion(name) {
  const registry =
    process.env.NPM_CONFIG_REGISTRY ??
    process.env.npm_config_registry ??
    "https://registry.npmjs.org";
  const url = `${registry.replace(/\/+$/, "")}/${name.replace("/", "%2f")}/latest`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `npm registry returned HTTP ${response.status} for ${name}`,
    );
  }
  return (await response.json()).version;
}

function tarEntry(tarball, wanted) {
  const buffer = gunzipSync(readFileSync(tarball));
  for (let offset = 0; offset + 512 <= buffer.length; ) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;
    const sizeText = header
      .subarray(124, 136)
      .toString("ascii")
      .replace(/\0.*$/, "")
      .trim();
    const size = Number.parseInt(sizeText || "0", 8);
    const bodyStart = offset + 512;
    if (name === wanted) return buffer.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

function packedManifest(packageDirectory) {
  const destination = mkdtempSync(path.join(tmpdir(), "aomi-pack-"));
  try {
    const result = spawnSync(
      "pnpm",
      ["pack", "--json", "--pack-destination", destination],
      {
        cwd: path.join(repoRoot, packageDirectory),
        encoding: "utf8",
        env: { ...process.env, npm_config_update_notifier: "false" },
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `pnpm pack failed for ${packageDirectory}: ${(result.stderr || result.stdout).trim()}`,
      );
    }
    const tarballName = readdirSync(destination).find((file) =>
      file.endsWith(".tgz"),
    );
    if (!tarballName)
      throw new Error(`pnpm pack emitted no tarball for ${packageDirectory}`);
    const manifest = tarEntry(
      path.join(destination, tarballName),
      "package/package.json",
    );
    if (!manifest)
      throw new Error(`packed ${packageDirectory} has no package/package.json`);
    return JSON.parse(manifest.toString("utf8"));
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

for (const changed of bumped) {
  const published = await registryVersion(changed.manifest.name);
  if (published) {
    const comparison = compareVersions(changed.manifest.version, published);
    if (comparison === null || comparison <= 0) {
      findings.push({
        file: changed.file,
        line: 1,
        message: `${changed.manifest.name}@${changed.manifest.version} is not newer than npm's ${published}`,
      });
    }
  }

  const packed = packedManifest(path.posix.dirname(changed.file));
  const packedDependencies = {
    ...packed.dependencies,
    ...packed.peerDependencies,
    ...packed.optionalDependencies,
  };
  for (const [name, range] of Object.entries(packedDependencies)) {
    if (typeof range === "string" && range.startsWith("workspace:")) {
      findings.push({
        file: changed.file,
        line: 1,
        message: `packed manifest leaves ${name} at unresolved protocol ${range}`,
      });
    }
  }
}

const publisherFile = "scripts/publish-package-if-needed.mjs";
const publisher = readFileSync(path.join(repoRoot, publisherFile), "utf8");
const pnpmSpawn = /\bspawn\(\s*["']pnpm["']/.exec(publisher);
if (!pnpmSpawn) {
  const npmSpawn = /\bspawn\(\s*["']npm["']/.exec(publisher);
  findings.push({
    file: publisherFile,
    line: lineNumberAt(publisher, npmSpawn?.index ?? 0),
    message:
      "publisher must spawn pnpm so workspace: ranges are rewritten before upload",
  });
}

reportFindings(findings, options);
