/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as shadcnRegistry } from "../shadcn-registry/PACKAGE.js";

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!dist/**", "!node_modules/**"]),
});

// The local smoke consumer of the widget library: tsc project references,
// then the Vite bundle.
const build = S.Shell.Build({
  bun: "await $`${tsc} -b`\nawait $`${vite} build`",
  using: {
    tsc: S.NodeModule.Bin("typescript", "tsc"),
    vite: S.NodeModule.Bin("vite"),
  },
  data: [srcs, shadcnRegistry.build],
  outDirs: ["dist"],
});

const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("vite"),
  args: ["--port", "3001"],
  data: [srcs, shadcnRegistry.build],
  readiness: { port: 3001 },
  health: { interval: "30s", failures: 3 },
  stop: { signal: "SIGINT", grace: "5s" },
});

export const Package = S.Package({
  targets: { build, dev, srcs },
});
