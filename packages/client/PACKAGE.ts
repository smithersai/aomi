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

// Recipes that change the CLI or chain catalog need the package's complete
// regression surface, not only the repository-wide test target as an opaque
// dependency.
const test = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "packages/client/test"],
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

export const Package = S.Package({
  targets: { build, srcs, test },
});
