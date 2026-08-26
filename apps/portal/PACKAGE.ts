/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as account } from "../../packages/account/PACKAGE.js";
import { Package as bffObservability } from "../../packages/bff-observability/PACKAGE.js";
import { Package as client } from "../../packages/client/PACKAGE.js";
import { Package as deploy } from "../../packages/deploy/PACKAGE.js";
import { Package as react } from "../../packages/react/PACKAGE.js";
import { Package as shadcnRegistry } from "../shadcn-registry/PACKAGE.js";

const nextConfig = S.file("next.config.ts");

const srcs = S.Filegroup({
  srcs: S.glob(["**", "!.next/**", "!node_modules/**"]),
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("next"),
  args: ["build"],
  data: [
    srcs,
    account.srcs,
    bffObservability.srcs,
    client.build,
    deploy.build,
    react.build,
    shadcnRegistry.build,
    nextConfig,
  ],
  // CI fixtures, mirrored from .github/workflows/ci.yml's apps job. Builds
  // read them, so they are key material; being deliberate fakes, they are
  // safe to pin.
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

const dev = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["dev"],
  data: [srcs],
  readiness: { port: 3000 },
  health: { interval: "30s", failures: 3 },
  stop: { signal: "SIGINT", grace: "5s" },
});

// chat.aomi.dev.
const deployVercel = S.Shell.Run({
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

const test = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run"],
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

// next typegen emits the typed-routes declarations tsc then checks against.
const typeCheck = S.Shell.Test({
  bun: "await $`${next} typegen`\nawait $`${tsc} --noEmit --incremental false`",
  using: {
    next: S.NodeModule.Bin("next"),
    tsc: S.NodeModule.Bin("typescript", "tsc"),
  },
  data: [srcs],
});

export const Package = S.Package({
  targets: { build, deploy: deployVercel, dev, lint, srcs, test, typeCheck },
});
