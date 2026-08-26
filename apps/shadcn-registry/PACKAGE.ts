/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as client } from "../../packages/client/PACKAGE.js";
import { Package as react } from "../../packages/react/PACKAGE.js";

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!dist/**", "!node_modules/**"]),
});

// build = build:registry (tsx codegen of the shadcn registry JSON) &&
// build:package (tsup && dist/styles.css). One target because both steps
// emit into the same dist/ tree.
const build = S.Shell.Build({
  bun: "await $`${tsx} scripts/build-registry.js`\nawait $`${tsup}`\nawait $`${node} scripts/build-package-css.mjs`",
  using: {
    tsx: S.NodeModule.Bin("tsx"),
    tsup: S.NodeModule.Bin("tsup"),
    node: S.Runtime.bin,
  },
  data: [srcs, client.build, react.build],
  outDirs: ["dist"],
});

export const Package = S.Package({
  targets: { build, srcs },
});
