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
  // Package targets execute from the repository root. Keep the package
  // working directory explicit because both codegen and tsup resolve their
  // source paths relative to it.
  bun: "await $`cd apps/shadcn-registry && ${tsx} scripts/build-registry.js`\nawait $`cd apps/shadcn-registry && ${tsup}`\nawait $`cd apps/shadcn-registry && ${node} scripts/build-package-css.mjs`",
  using: {
    tsx: S.NodeModule.Bin("tsx"),
    tsup: S.NodeModule.Bin("tsup"),
    node: S.Runtime.bin,
  },
  data: [srcs, client.build, react.build],
  outDirs: ["dist"],
  // tsx creates an IPC socket in the host temporary directory. macOS
  // sandbox-exec rejects that listen(2), so this build cannot use the
  // default no-network profile even though the build itself is offline.
  sandbox: "none",
});

export const Package = S.Package({
  targets: { build, srcs },
});
