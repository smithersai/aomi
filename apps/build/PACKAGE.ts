/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as client } from "../../packages/client/PACKAGE.js";
import { Package as deployPkg } from "../../packages/deploy/PACKAGE.js";
import { Package as react } from "../../packages/react/PACKAGE.js";
import { Package as shadcnRegistry } from "../shadcn-registry/PACKAGE.js";
import { Package as smither } from "../../packages/smither/PACKAGE.js";

const nextConfig = S.file("next.config.ts");
const serviceToml = S.file("service.portal.toml");

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!.next/**", "!node_modules/**"]),
});

// The package's own build script builds the smither closure first
// (pnpm --filter "@aomi-labs/smither..." build); here that ordering is the
// data edge on smither.build. The service TOML is force-included in the
// standalone output (outputFileTracingIncludes), so it is a declared input.
const build = S.Shell.Build({
  bin: S.NodeModule.Bin("next"),
  args: ["build"],
  data: [
    srcs,
    smither.build,
    client.build,
    deployPkg.build,
    react.build,
    shadcnRegistry.build,
    nextConfig,
    serviceToml,
  ],
  // CI fixtures, mirrored from .github/workflows/ci.yml's apps job.
  env: {
    BETTER_AUTH_SECRET: "ci-build-only-secret-at-least-32-bytes-long",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/aomi_ci_build",
    NEXT_PUBLIC_PARA_API_KEY: "ci-fixture-not-a-secret",
    NEXT_PUBLIC_PARA_ENVIRONMENT: "BETA",
    NEXT_PUBLIC_PROJECT_ID: "000000000000000000000000000000000000000000",
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      "000000000000000000000000000000000000000000",
  },
  outDirs: [".next"],
});

// The /build page's pipeline, aliased into this package: the Create button
// drives exactly //packages/smither:shipApp's static plan through the BFF
// (src/server/bff/build/engine.ts).
const buildPipeline = S.Alias(smither.shipApp);

const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["dev"],
  data: [srcs],
  readiness: { port: 3000 },
  health: { interval: "30s", failures: 3 },
  stop: { signal: "SIGINT", grace: "5s" },
});

// build.aomi.dev.
const deploy = S.Shell.Run({
  bin: S.Host.bin("vercel"),
  args: [S.Flags.production],
  approval: "required",
  secrets: [S.Secret("VERCEL_TOKEN")],
  sandbox: { network: true },
});

const lint = S.Shell.Test({
  bin: S.NodeModule.Bin("eslint"),
  args: ["."],
  data: [srcs, S.file("//eslint.config.mjs")],
});

// The package's test script wraps the root vitest over apps/build/src.
const test = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/run-tests.mjs", "--passWithNoTests"],
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

const typeCheck = S.Shell.Test({
  bun: "await $`${next} typegen`\nawait $`${tsc} --noEmit --incremental false`",
  using: {
    next: S.NodeModule.Bin("next"),
    tsc: S.NodeModule.Bin("typescript", "tsc"),
  },
  data: [srcs],
});

export const Package = S.Package({
  targets: { build, buildPipeline, deploy, dev, lint, srcs, test, typeCheck },
});
