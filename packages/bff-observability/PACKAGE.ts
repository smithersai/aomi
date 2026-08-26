/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as account } from "../account/PACKAGE.js";
import { Package as deploy } from "../deploy/PACKAGE.js";

// Source-only package: the Sentry privacy boundary for BFF errors.
const srcs = S.Filegroup({
  srcs: S.glob(["**", "!node_modules/**"]),
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit"],
  data: [srcs, account.srcs, deploy.srcs],
});

const test = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "test"],
  data: [srcs, S.file("vitest.config.ts")],
});

export const Package = S.Package({
  targets: { srcs, test, typeCheck },
});
