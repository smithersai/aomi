/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as service } from "../service/PACKAGE.js";

// Source-only package: better-auth account model, SIWE, telegram and widget
// auth subpath exports. No build step; the type check is the gate.
const srcs = S.Filegroup({
  srcs: S.glob(["**", "!node_modules/**"]),
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit"],
  data: [srcs, service.srcs],
});

export const Package = S.Package({
  targets: { srcs, typeCheck },
});
