#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { parseCommonArgs, reportFindings } from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix) throw new Error("release-cut.mjs does not accept --fix");

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

const requestedSha = process.env.AOMI_RELEASE_SHA?.trim();
const releaseDate =
  process.env.AOMI_RELEASE_DATE?.trim() ??
  new Date().toISOString().slice(0, 10);
const branch = `release/${releaseDate}`;
const findings = [];

if (!requestedSha) {
  findings.push({
    file: "PACKAGE.ts",
    line: 1,
    message:
      "AOMI_RELEASE_SHA is required; release cuts must name the soaked main SHA",
  });
} else if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
  findings.push({
    file: "PACKAGE.ts",
    line: 1,
    message: `AOMI_RELEASE_DATE must be YYYY-MM-DD, received ${releaseDate}`,
  });
} else {
  const clean = git(["status", "--porcelain"]);
  if (clean.status !== 0 || clean.stdout.trim()) {
    findings.push({
      file: ".git",
      line: 1,
      message: "release cut requires a clean worktree",
    });
  }

  const resolved = git(["rev-parse", "--verify", `${requestedSha}^{commit}`]);
  if (resolved.status !== 0) {
    findings.push({
      file: ".git",
      line: 1,
      message: `AOMI_RELEASE_SHA does not resolve to a commit: ${requestedSha}`,
    });
  } else {
    const sha = resolved.stdout.trim();
    const onMain = git(["merge-base", "--is-ancestor", sha, "origin/main"]);
    if (onMain.status !== 0) {
      findings.push({
        file: ".git",
        line: 1,
        message: `${sha} is not an ancestor of origin/main and cannot be a soaked release candidate`,
      });
    }

    const existing = git(["rev-parse", "--verify", `refs/heads/${branch}`]);
    if (existing.status === 0 && existing.stdout.trim() !== sha) {
      findings.push({
        file: ".git",
        line: 1,
        message: `${branch} already exists at ${existing.stdout.trim()}, not requested SHA ${sha}`,
      });
    }

    if (findings.length === 0) {
      const switchResult =
        existing.status === 0
          ? git(["switch", branch])
          : git(["switch", "-c", branch, sha]);
      if (switchResult.status !== 0) {
        findings.push({
          file: ".git",
          line: 1,
          message: `could not switch to ${branch}: ${(switchResult.stderr || switchResult.stdout).trim()}`,
        });
      }
    }
  }
}

reportFindings(findings, options);
