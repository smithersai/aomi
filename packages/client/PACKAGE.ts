/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!dist/**", "!node_modules/**"]),
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("tsup"),
  data: [srcs, S.file("tsup.config.ts")],
  outDirs: ["dist"],
});

export const Package = S.Package({
  targets: { build, srcs },
});
