import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function readRepoFile(file) {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

export function lineNumberAt(source, offset) {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

export function walkFiles(directory, predicate = () => true) {
  const root = path.join(repoRoot, directory);
  const files = [];

  const visit = (absoluteDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const absolute = path.join(absoluteDirectory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else {
        const relative = path
          .relative(repoRoot, absolute)
          .replaceAll(path.sep, "/");
        if (predicate(relative)) files.push(relative);
      }
    }
  };

  visit(root);
  return files.sort();
}

export function parseCommonArgs(argv = process.argv.slice(2)) {
  const allowed = new Set(["--fix", "--json"]);
  const unknown = argv.filter((argument) => !allowed.has(argument));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    );
  }
  return { fix: argv.includes("--fix"), json: argv.includes("--json") };
}

export function reportFindings(findings, { json = false } = {}) {
  findings.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.message.localeCompare(right.message),
  );

  if (json) {
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  } else {
    for (const finding of findings) {
      process.stdout.write(
        `${finding.file}:${finding.line}: ${finding.message}\n`,
      );
    }
  }

  if (findings.length > 0) process.exitCode = 1;
}

export function sourceLine(source, line) {
  return source.split("\n")[Math.max(0, line - 1)] ?? "";
}
