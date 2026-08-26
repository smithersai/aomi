/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as client } from "../client/PACKAGE.js";

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!dist/**", "!node_modules/**"]),
});

// The publishable widget library. Two entries compile these sources: this
// package's tsup, and the root's build:lib (//tsup.config.ts) which emits
// the root aomi-widget dist; //:buildLib carries that second edge.
const build = S.Shell.Build({
  bin: S.NodeModule.Bin("tsup"),
  data: [srcs, client.build, S.file("tsup.config.ts")],
  outDirs: ["dist"],
});

export const Package = S.Package({
  targets: { build, srcs },
});
