// Validates BuildPlan JSON files against the source-of-truth schema in
// src/plan.ts. With no arguments it checks every plans/*.json; a missing
// plans/ directory is vacuously green. Exit 1 names every violation.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildPlanSchema, compositionIssues } from "../src/plan.js";

const plansDir = new URL("../plans/", import.meta.url).pathname;
const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : existsSync(plansDir)
      ? readdirSync(plansDir)
          .filter((file) => file.endsWith(".json"))
          .map((file) => join(plansDir, file))
      : [];

let failures = 0;
for (const file of files) {
  const parsed = buildPlanSchema.safeParse(
    JSON.parse(readFileSync(file, "utf8")),
  );
  if (!parsed.success) {
    console.error(`${file}: ${parsed.error.message}`);
    failures++;
    continue;
  }
  const issues = compositionIssues(parsed.data);
  if (issues.length > 0) {
    console.error(`${file}: ${issues.join("; ")}`);
    failures++;
  }
}
if (failures > 0) process.exit(1);
console.log(`${files.length} plan(s) valid`);
