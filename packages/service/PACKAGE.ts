/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

// Source-only package (main: ./src/index.ts): consumers compile it, so the
// only targets are sources and the type check. It is the TypeScript twin of
// the Rust aomi-service crate in product-mono: it parses service TOML and
// mints/verifies AccountBearers (jose).
const srcs = S.Filegroup({
  srcs: S.glob(["**", "!node_modules/**"]),
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit"],
  data: [srcs],
});

export const Package = S.Package({
  targets: { srcs, typeCheck },
});
