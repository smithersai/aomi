/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as account } from "../../packages/account/PACKAGE.js";
import { Package as react } from "../../packages/react/PACKAGE.js";
import { Package as shadcnRegistry } from "../shadcn-registry/PACKAGE.js";

const nextConfig = S.file("next.config.ts");

const srcs = S.Filegroup({
  srcs: S.glob([
    "**",
    "!.next/**",
    "!.source/**",
    "!node_modules/**",
    "!public/r/**",
  ]),
});

// fumadocs-mdx is the postinstall codegen: content/ compiles into the
// .source map next reads. Generated, so it is a target, not a committed
// tree.
const mdx = S.Generate({
  bin: S.NodeModule.Bin("fumadocs-mdx"),
  data: [S.glob(["content/**"]), S.file("source.config.ts")],
  changes: [".source/**"],
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("next"),
  args: ["build"],
  data: [
    srcs,
    mdx,
    react.build,
    shadcnRegistry.build,
    account.srcs,
    nextConfig,
  ],
  outDirs: [".next"],
});

const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["dev"],
  data: [srcs, mdx],
  readiness: { port: 3000 },
  health: { interval: "30s", failures: 3 },
  stop: { signal: "SIGINT", grace: "5s" },
});

// aomi.dev. The Vercel project still builds through the retained
// vercel-build script in //package.json; this target is the outward action
// itself, so approval is the consent.
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
  targets: { build, deploy, dev, lint, mdx, srcs, typeCheck },
});
