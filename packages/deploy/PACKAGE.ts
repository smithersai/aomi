/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!dist/**", "!node_modules/**"]),
});

const build = S.Shell.Build({
  bun: "await $`cd packages/deploy && ${tsup}`",
  using: { tsup: S.NodeModule.Bin("tsup") },
  data: [srcs, S.file("tsup.config.ts")],
  outDirs: ["dist"],
});

const test = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "packages/deploy/test"],
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

export const Package = S.Package({
  targets: { build, srcs, test },
});
