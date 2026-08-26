/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as account } from "../../packages/account/PACKAGE.js";
import { Package as client } from "../../packages/client/PACKAGE.js";

const nextConfig = S.file("next.config.ts");

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!.next/**", "!node_modules/**"]),
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("next"),
  args: ["build"],
  data: [srcs, account.srcs, client.build, nextConfig],
  outDirs: [".next"],
});

const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["dev"],
  data: [srcs],
  readiness: { port: 3000 },
  health: { interval: "30s", failures: 3 },
  stop: { signal: "SIGINT", grace: "5s" },
});

const deploy = S.Shell.Run({
  bin: S.Host.bin("vercel"),
  args: [S.Flags.production],
  approval: "required",
  secrets: [S.Secret("VERCEL_TOKEN")],
  sandbox: { network: true },
});

const lint = S.Shell.Test({
  bin: S.NodeModule.Bin("eslint"),
  args: ["."],
  data: [srcs, S.file("//eslint.config.mjs")],
});

// The package's own test script: root vitest over src, then the node:test
// unit files.
const test = S.Shell.Test({
  command:
    "pnpm --dir ../.. exec vitest run apps/telegram/src && node --test test/*.test.mjs",
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

// test:unit alone: the node:test files, no vitest. //package.json's
// test:telegram delegates here, and CI invokes that script.
const testUnit = S.Shell.Test({
  command: "node --test test/*.test.mjs",
  data: [S.glob(["test/**"])],
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit"],
  data: [srcs],
});

export const Package = S.Package({
  targets: { build, deploy, dev, lint, srcs, test, testUnit, typeCheck },
});
