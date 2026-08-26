/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as account } from "../../packages/account/PACKAGE.js";
import { Package as client } from "../../packages/client/PACKAGE.js";
import { Package as react } from "../../packages/react/PACKAGE.js";
import { Package as shadcnRegistry } from "../shadcn-registry/PACKAGE.js";

const nextConfig = S.file("next.config.ts");

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!.next/**", "!node_modules/**"]),
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("next"),
  args: ["build"],
  data: [
    srcs,
    account.srcs,
    client.build,
    react.build,
    shadcnRegistry.build,
    nextConfig,
  ],
  outDirs: [".next"],
});

// The app's own dev script pins webpack and an open hostname; the port
// variants (dev:3000, dev:3001) stay as package.json compatibility scripts.
const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["dev", "--webpack", "--disable-source-maps", "--hostname", "0.0.0.0"],
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

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit", "--project", "tsconfig.json"],
  data: [srcs],
});

export const Package = S.Package({
  targets: { build, deploy, dev, lint, srcs, typeCheck },
});
