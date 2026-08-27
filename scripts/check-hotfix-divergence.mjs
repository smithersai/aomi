#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { parseCommonArgs, reportFindings } from "./lint-utils.mjs";

const options = parseCommonArgs();
if (options.fix) throw new Error("check-hotfix-divergence.mjs is report-only");

const mainRef = process.env.AOMI_MAIN_REF?.trim() || "origin/main";
const prodRef = process.env.AOMI_PROD_REF?.trim() || "origin/prod";
const repository = process.env.GITHUB_REPOSITORY?.trim() || "aomi-labs/aomi";
const token = process.env.GITHUB_TOKEN?.trim();
const findings = [];

function git(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

const mergeBase = git(["merge-base", mainRef, prodRef]);
if (mergeBase.status !== 0) {
  findings.push({
    file: ".git",
    line: 1,
    message: `cannot compute merge base for ${mainRef} and ${prodRef}`,
  });
} else {
  const baseTree = git(["rev-parse", `${mergeBase.stdout.trim()}^{tree}`]);
  const prodTree = git(["rev-parse", `${prodRef}^{tree}`]);
  if (baseTree.status !== 0 || prodTree.status !== 0) {
    findings.push({
      file: ".git",
      line: 1,
      message: `cannot resolve comparison trees for ${mainRef} and ${prodRef}`,
    });
  } else if (baseTree.stdout.trim() !== prodTree.stdout.trim()) {
    if (!token) {
      findings.push({
        file: ".git",
        line: 1,
        message: `${prodRef} contains prod-only tree changes; GITHUB_TOKEN is required to verify an open prod -> main back-merge PR`,
      });
    } else {
      const [owner] = repository.split("/");
      const url = new URL(`https://api.github.com/repos/${repository}/pulls`);
      url.searchParams.set("state", "open");
      url.searchParams.set("base", "main");
      url.searchParams.set("head", `${owner}:prod`);
      let pulls;
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "x-github-api-version": "2022-11-28",
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
          throw new Error(`GitHub returned HTTP ${response.status}`);
        pulls = await response.json();
      } catch (error) {
        findings.push({
          file: ".git",
          line: 1,
          message: `prod diverges and the back-merge PR check failed closed: ${error instanceof Error ? error.message : error}`,
        });
      }
      if (pulls && pulls.length === 0) {
        findings.push({
          file: ".git",
          line: 1,
          message: `${prodRef} contains prod-only changes and no prod -> main PR is open; run //.github:backmergePr before releasing`,
        });
      }
    }
  }
}

reportFindings(findings, options);
