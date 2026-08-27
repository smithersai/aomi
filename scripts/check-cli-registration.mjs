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
if (options.fix) throw new Error("check-cli-registration.mjs is report-only");

const rootFile = "packages/client/src/cli/root.ts";
const defsDirectory = "packages/client/src/cli/commands/defs";
const rootSource = readFileSync(path.join(repoRoot, rootFile), "utf8");
const findings = [];

function objectBody(source, marker) {
  const markerIndex = source.indexOf(marker);
  const open = source.indexOf("{", markerIndex);
  if (markerIndex < 0 || open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) {
      return source.slice(open + 1, index);
    }
  }
  return "";
}

const rootSubcommandsBody = objectBody(rootSource, "subCommands:");
const rootSubcommands = new Map(
  [
    ...rootSubcommandsBody.matchAll(
      /^\s*["']?([a-z][\w-]*)["']?\s*:\s*(\w+Def)\s*,?/gm,
    ),
  ].map((match) => [match[1], match[2]]),
);
const namesBody =
  /SUBCOMMAND_NAMES\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/.exec(
    rootSource,
  )?.[1];
if (!namesBody)
  throw new Error(`Could not parse SUBCOMMAND_NAMES in ${rootFile}`);
const subcommandNames = new Set(
  [...namesBody.matchAll(/["']([a-z][\w-]*)["']/g)].map((match) => match[1]),
);

for (const command of rootSubcommands.keys()) {
  if (!subcommandNames.has(command)) {
    findings.push({
      file: rootFile,
      line: lineNumberAt(rootSource, rootSource.indexOf(`    ${command}:`)),
      message: `${command} is registered in root.subCommands but missing from SUBCOMMAND_NAMES`,
    });
  }
}
for (const command of subcommandNames) {
  if (!rootSubcommands.has(command)) {
    findings.push({
      file: rootFile,
      line: lineNumberAt(rootSource, namesBody.indexOf(`"${command}"`)),
      message: `${command} is advertised by SUBCOMMAND_NAMES but missing from root.subCommands`,
    });
  }
}

const defFiles = walkFiles(
  defsDirectory,
  (file) =>
    /\/[a-z][\w-]*\.ts$/.test(file) && !/(?:shared|\.test)\.ts$/.test(file),
);
const registeredDefs = new Set(rootSubcommands.values());
const nestedCommands = new Map();
const parsedDefFiles = defFiles.map((file) => ({
  file,
  source: readFileSync(path.join(repoRoot, file), "utf8"),
}));
for (const { source } of parsedDefFiles) {
  const body = objectBody(source, "subCommands:");
  for (const pair of body.matchAll(
    /^\s*["']?([a-z][\w-]*)["']?\s*:\s*(\w+Def)\s*,?/gm,
  )) {
    registeredDefs.add(pair[2]);
  }
}
for (const { file, source } of parsedDefFiles) {
  const body = objectBody(source, "subCommands:");
  const pairs = [
    ...body.matchAll(/^\s*["']?([a-z][\w-]*)["']?\s*:\s*(\w+Def)\s*,?/gm),
  ];
  for (const pair of pairs) registeredDefs.add(pair[2]);
  const exported = /export\s+const\s+(\w+Def)\s*=\s*defineCommand/.exec(
    source,
  )?.[1];
  if (exported)
    nestedCommands.set(exported, new Set(pairs.map((pair) => pair[1])));

  for (const match of source.matchAll(
    /export\s+const\s+(\w+Def)\s*=\s*defineCommand/g,
  )) {
    if (!registeredDefs.has(match[1]) && !rootSource.includes(match[1])) {
      findings.push({
        file,
        line: lineNumberAt(source, match.index),
        message: `${match[1]} is exported from commands/defs but is unreachable from root.subCommands`,
      });
    }
  }
}

const docs = [
  ...walkFiles("packages/client/src/cli", (file) => /\.[cm]?[jt]s$/.test(file)),
  "packages/client/README.md",
  "apps/landing/content/guides/reference/cli.mdx",
];
for (const file of docs) {
  const source = readFileSync(path.join(repoRoot, file), "utf8");
  for (const match of source.matchAll(
    /(?<![./~])\baomi[ \t]+([a-z][\w-]*)(?:[ \t]+([a-z][\w-]*))?/g,
  )) {
    const [, rootCommand, childCommand] = match;
    if (rootCommand === "v" && source[match.index + match[0].length] === "$") {
      continue;
    }
    if (!rootSubcommands.has(rootCommand)) {
      findings.push({
        file,
        line: lineNumberAt(source, match.index),
        message: `documented command "aomi ${rootCommand}" is not registered at the CLI root`,
      });
      continue;
    }
    const rootDef = rootSubcommands.get(rootCommand);
    const children = nestedCommands.get(rootDef);
    if (children?.size && childCommand && !children.has(childCommand)) {
      findings.push({
        file,
        line: lineNumberAt(source, match.index),
        message: `documented command "aomi ${rootCommand} ${childCommand}" is not registered under ${rootCommand}`,
      });
    }
  }
}

reportFindings(findings, options);
