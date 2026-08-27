/// <reference path="./smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as base } from "./apps/base/PACKAGE.js";
import { Package as build } from "./apps/build/PACKAGE.js";
import { Package as landing } from "./apps/landing/PACKAGE.js";
import { Package as portal } from "./apps/portal/PACKAGE.js";
import { Package as shadcnRegistry } from "./apps/shadcn-registry/PACKAGE.js";
import { Package as telegram } from "./apps/telegram/PACKAGE.js";
import { Package as account } from "./packages/account/PACKAGE.js";
import { Package as client } from "./packages/client/PACKAGE.js";
import { Package as deploy } from "./packages/deploy/PACKAGE.js";
import { Package as react } from "./packages/react/PACKAGE.js";
import { Package as service } from "./packages/service/PACKAGE.js";
import { Package as repoScripts } from "./scripts/PACKAGE.js";

const packageJson = S.file("//package.json");

const srcs = S.Filegroup({
  srcs: S.glob([
    "**",
    "!node_modules/**",
    "!**/.next/**",
    "!**/dist/**",
    "!**/.turbo/**",
    "!output/**",
  ]),
});

// The auth stack script manages its own process tree and env files outside
// the workspace, so it runs unsandboxed. Port 8080 is the stack's listener
// per specs/METADATA.md.
const authStack = S.Shell.Serve({
  command: "./scripts/dev-auth-stack.sh",
  readiness: { port: 8080 },
  health: { interval: "15s", failures: 3 },
  stop: { signal: "SIGTERM", grace: "10s" },
  sandbox: "none",
});

const authStackSmoke = S.Shell.Test({
  command: "node ./scripts/smoke-auth-stack.mjs",
  services: [authStack],
});

const authStackStatus = S.Shell.Run({
  command: "./scripts/dev-auth-stack.sh status",
  sandbox: "none",
});

const authStackStop = S.Shell.Run({
  command: "./scripts/dev-auth-stack.sh stop",
  sandbox: "none",
});

// build:lib = build:client && tsup. The client build is a data edge; the
// tsup step compiles packages/react/src into the publishable widget dist.
const buildLib = S.Shell.Build({
  bin: S.NodeModule.Bin("tsup"),
  data: [
    client.build,
    react.srcs,
    S.file("//tsup.config.ts"),
    S.file("//tsconfig.lib.json"),
  ],
  outDirs: ["dist"],
});

const buildPackages = S.Suite({
  tests: [
    service.typeCheck,
    account.typeCheck,
    client.build,
    react.build,
    deploy.build,
    shadcnRegistry.build,
  ],
});

const buildApps = S.Suite({
  tests: [landing.build, base.build, portal.build, build.build, telegram.build],
});

const buildAll = S.Suite({
  tests: [buildPackages, buildApps],
});

const lint = S.Shell.Test({
  bin: S.NodeModule.Bin("eslint"),
  args: ["."],
  data: [srcs, S.file("//eslint.config.mjs")],
});

const lintApps = S.Suite({
  tests: [landing.lint, base.lint, portal.lint, build.lint, telegram.lint],
});

// Deterministic PR-history lints. Each script scans the current tree, prints
// path:line findings (or {findings:[...]} with --json), and stays silent when
// clean so a cached green target remains legible.
const bffRouteContract = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-bff-routes.mjs"],
  data: [
    S.file("//scripts/check-bff-routes.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "apps/portal/src/app/api/**/route.ts",
      "apps/portal/src/server/bff/**",
      "apps/build/src/app/api/**/route.ts",
      "apps/build/src/server/bff/**",
    ]),
  ],
});

// The runtime declaration is syntax-only and therefore safe to repair
// mechanically. Origin/authorization findings remain report-only.
const bffRouteContractFix = S.Shell.Diff({
  bin: S.Runtime.bin,
  args: ["scripts/check-bff-routes.mjs", "--fix"],
  data: [
    S.file("//scripts/check-bff-routes.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "apps/portal/src/app/api/**/route.ts",
      "apps/portal/src/server/bff/**",
      "apps/build/src/app/api/**/route.ts",
      "apps/build/src/server/bff/**",
    ]),
  ],
  changes: ["apps/*/src/app/api/**/route.ts"],
});

const deployStatusExhaustive = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-deploy-states.mjs"],
  data: [
    S.file("//scripts/check-deploy-states.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.file("//packages/deploy/src/types.ts"),
    S.glob([
      "apps/portal/src/features/launch/**",
      "apps/build/src/features/launch/**",
    ]),
  ],
});

const envKeyParity = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-env-parity.mjs"],
  data: [
    S.file("//scripts/check-env-parity.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "apps/*/src/**",
      "apps/*/app/**",
      "apps/*/.env.example",
      "apps/*/LOCAL_ENV.example",
    ]),
  ],
});

const paymasterForwardedHost = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-forwarded-origin.mjs"],
  data: [
    S.file("//scripts/check-forwarded-origin.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob(["apps/*/app/api/**/route.ts", "apps/*/src/app/api/**/route.ts"]),
  ],
});

const publishCoherence = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-publish-coherence.mjs"],
  data: [
    S.file("//scripts/check-publish-coherence.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "packages/*/package.json",
      "apps/shadcn-registry/package.json",
      "scripts/publish-package-if-needed.mjs",
    ]),
  ],
  sandbox: { network: true },
});

const registryBuildIntegrity = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-registry-integrity.mjs"],
  data: [
    shadcnRegistry.build,
    S.file("//scripts/check-registry-integrity.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "apps/shadcn-registry/src/**",
      "apps/shadcn-registry/scripts/build-registry.js",
      "apps/landing/public/r/**",
    ]),
  ],
});

const singleInstanceProviderSdk = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-provider-sdk-dupes.mjs"],
  data: [
    S.file("//scripts/check-provider-sdk-dupes.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.file("//pnpm-lock.yaml"),
    S.glob(["apps/*/package.json", "packages/*/package.json"]),
  ],
});

const deterministicLints = S.Suite({
  tests: [
    bffRouteContract,
    deployStatusExhaustive,
    envKeyParity,
    paymasterForwardedHost,
    publishCoherence,
    registryBuildIntegrity,
    singleInstanceProviderSdk,
  ],
});

// Judgment lints. registryParity enforces the AGENTS.md publish rules that
// prose cannot: shipped files appear in the registry manifest and versions
// bump in the same change. secretHygiene enforces the secret-handling
// rules. Add --fix to have either correct its findings inside its write
// set.
const registryParityLint = S.Agent.Lint({
  agent: S.Agents.luna,
  prompt: S.file("//workflows/lints/registry-parity.md"),
  data: [S.gitDiff({ paths: ["apps/shadcn-registry/**", "packages/**"] })],
  fixes: ["apps/shadcn-registry/**", "packages/*/package.json"],
});

const secretHygieneLint = S.Agent.Lint({
  agent: S.Agents.luna,
  prompt: S.file("//workflows/lints/secret-hygiene.md"),
  data: [S.gitDiff()],
  fixes: ["**"],
});

// Judgment is required here because the same fallback value can be safe for
// a read-only display and authorization-bypassing for a write consumer.
const failClosedAuthorization = S.Agent.Lint({
  agent: S.Agents.luna,
  prompt: S.file("//workflows/lints/fail-closed.md"),
  data: [
    S.gitDiff({
      paths: [
        "apps/*/src/server/**",
        "packages/deploy/src/bff/**",
        "packages/account/src/**",
      ],
    }),
  ],
});

// engineNames enforces the Build page's own contract
// (smither-run-mapper.ts): engine vocabulary never reaches product labels.
const engineNamesLint = S.Agent.Lint({
  agent: S.Agents.luna,
  prompt: S.file("//workflows/lints/engine-names-in-ui.md"),
  data: [S.gitDiff({ paths: ["apps/build/src/**"] })],
  fixes: ["apps/build/src/**"],
});

const agentLints = S.Suite({
  tests: [engineNamesLint, registryParityLint, secretHygieneLint],
});

const cliRegistrationParity = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-cli-registration.mjs"],
  data: [
    S.file("//scripts/check-cli-registration.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.glob([
      "packages/client/src/cli/**",
      "packages/client/README.md",
      "apps/landing/content/guides/reference/cli.mdx",
    ]),
  ],
});

const typeCheckApps = S.Suite({
  tests: [
    landing.typeCheck,
    base.typeCheck,
    portal.typeCheck,
    build.typeCheck,
    telegram.typeCheck,
  ],
});

// Intent-level edit recipes mined from repeated production fixes. Prompts
// own the sequencing and exclusions; target write sets are the hard boundary.
const addBffRoute = S.Agent.Diff({
  agent: S.Agents.luna,
  prompt: S.file("//prompts/add-bff-route.md"),
  payload: {
    app: S.Input.String("portal|build"),
    route: S.Input.String(
      "domain/name, HTTP method, what it proxies, auth class, new env vars",
    ),
  },
  data: [
    S.glob([
      "apps/portal/src/server/bff/**",
      "apps/portal/src/app/api/bff/**",
      "apps/portal/src/lib/api-paths.ts",
      "apps/portal/src/lib/csrf.ts",
      "apps/portal/src/lib/validate-input.ts",
      "apps/portal/LOCAL_ENV.example",
      "apps/build/src/server/bff/**",
      "apps/build/src/app/api/bff/**",
      "apps/build/src/lib/api-paths.ts",
      "docs/topics/bff/facts/endpoints.md",
      "packages/bff-observability/src/**",
    ]),
  ],
  changes: [
    "apps/portal/src/server/bff/**",
    "apps/portal/src/app/api/**",
    "apps/portal/src/lib/api-paths.ts",
    "apps/portal/src/features/*/client.ts",
    "apps/portal/src/features/*/contracts.ts",
    "apps/portal/LOCAL_ENV.example",
    "apps/build/src/server/bff/**",
    "apps/build/src/app/api/**",
    "apps/build/src/lib/api-paths.ts",
    "apps/build/src/features/*/client.ts",
    "docs/topics/bff/**",
  ],
  gates: [
    bffRouteContract,
    portal.test,
    build.test,
    envKeyParity,
    typeCheckApps,
  ],
  maxRounds: 2,
});

const addCliSubcommand = S.Agent.Diff({
  agent: S.Agents.luna,
  prompt: S.file("//prompts/add-cli-subcommand.md"),
  payload: {
    command: S.Input.String(
      "noun verb, flags, env-var fallbacks, backend call, and ~/.aomi state",
    ),
  },
  data: [
    S.glob([
      "packages/client/src/cli/**",
      "packages/client/test/cli/**",
      "packages/client/README.md",
      "apps/landing/content/guides/reference/cli.mdx",
      "packages/deploy/src/**",
    ]),
  ],
  changes: [
    "packages/client/src/cli/**",
    "packages/client/test/cli/**",
    "packages/client/README.md",
    "packages/client/package.json",
    "apps/landing/content/guides/reference/cli.mdx",
  ],
  gates: [cliRegistrationParity, client.test, client.build],
  maxRounds: 2,
});

const addEvmChain = S.Agent.Diff({
  agent: S.Agents.sol,
  prompt: S.file("//prompts/add-evm-chain.md"),
  payload: {
    chain: S.Input.String(
      "name, chain id, native ticker, display decimals, explorer URL, RPC/Alchemy slug, testnet|mainnet",
    ),
  },
  data: [
    S.glob([
      "packages/client/src/chains.ts",
      "packages/client/test/chains.unit.test.ts",
      "packages/client/test/registry-chain-artifacts.unit.test.ts",
      "packages/account/src/better-auth/siwe.ts",
      "apps/shadcn-registry/src/lib/wallet-kit/**",
      "apps/shadcn-registry/src/components/icons/chains/**",
      "apps/shadcn-registry/src/registry.ts",
      "apps/portal/src/components/providers/wallet-providers.tsx",
      "apps/landing/app/components/landing-*-provider.tsx",
      "packages/react/src/runtime/utils.ts",
      "packages/react/src/contexts/ext-user-context.tsx",
    ]),
  ],
  changes: [
    "packages/client/src/chains.ts",
    "packages/client/test/**",
    "packages/account/src/better-auth/siwe.ts",
    "apps/shadcn-registry/src/**",
    "apps/portal/src/components/providers/**",
    "apps/landing/app/components/**",
    "apps/docs/src/components/config.tsx",
    "packages/react/src/runtime/**",
    "packages/react/src/contexts/**",
  ],
  gates: [client.test, shadcnRegistry.build, registryParityLint, typeCheckApps],
  maxRounds: 3,
});

const buildControlPlaneSurface = S.Agent.Diff({
  agent: S.Agents.sol,
  prompt: S.file("//prompts/build-control-plane-surface.md"),
  payload: {
    surface: S.Input.String(
      "page or tab name, area (launch|operate|settings), data shown, and Soon-gated actions",
    ),
  },
  data: [
    S.glob([
      "apps/build/src/app/(control-plane)/**",
      "apps/build/src/features/**",
      "apps/build/src/server/bff/**",
      "apps/build/src/lib/api-paths.ts",
      "apps/build/src/lib/deep-links.ts",
      "apps/build/src/lib/glossary.ts",
      "apps/build/src/components/control-plane/**",
    ]),
  ],
  changes: ["apps/build/src/**", "specs/STATE.md"],
  gates: [build.test, build.lint, engineNamesLint, typeCheckApps],
  maxRounds: 3,
});

const deployContractExtension = S.Agent.Diff({
  agent: S.Agents.sol,
  prompt: S.file("//prompts/deploy-contract-extension.md"),
  payload: {
    field: S.Input.String(
      "wire field or state, its OpenAPI/backend-PR source, and where it renders",
    ),
  },
  data: [
    S.glob([
      "packages/deploy/src/**",
      "packages/deploy/test/**",
      "packages/client/test/fixtures/backend-openapi.json",
      "packages/client/test/fixtures/manager-openapi.json",
      "apps/build/src/server/bff/**",
      "apps/build/src/features/launch/**",
      "apps/build/src/features/operate/**",
      "apps/portal/src/features/launch/**",
    ]),
  ],
  changes: [
    "packages/deploy/**",
    "apps/build/src/**",
    "apps/portal/src/features/launch/**",
  ],
  gates: [deploy.test, build.test, deployStatusExhaustive, typeCheckApps],
  maxRounds: 3,
});

const releaseFanout = S.Agent.Diff({
  agent: S.Agents.luna,
  prompt: S.file("//prompts/release-fanout.md"),
  payload: {
    package: S.Input.Optional(
      S.Input.String("package that changed; omit to derive from the diff"),
    ),
  },
  data: [
    S.gitDiff({
      paths: ["packages/*/src/**", "apps/shadcn-registry/src/**"],
    }),
    S.glob([
      "packages/*/package.json",
      "apps/shadcn-registry/package.json",
      "pnpm-lock.yaml",
      "scripts/publish-package-if-needed.mjs",
    ]),
  ],
  changes: [
    "packages/*/package.json",
    "apps/shadcn-registry/package.json",
    "packages/*/dist/**",
    "apps/shadcn-registry/dist/**",
    "apps/landing/public/r/**",
    "pnpm-lock.yaml",
  ],
  gates: [
    publishCoherence,
    buildPackages,
    registryParityLint,
    registryBuildIntegrity,
  ],
  maxRounds: 2,
});

// The backend OpenAPI contract: the committed fixture is the input and the
// client is the surface under test (test:openapi in //package.json).
const openapiContract = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run", "packages/client/test/backend-openapi.contract.test.ts"],
  data: [
    client.srcs,
    S.file("//vitest.config.ts"),
    S.file("//vitest.setup.ts"),
  ],
});

// The live half of the contract: the committed fixture against the deployed
// backend. CI gates prod promotion on this (ci.yml
// live-production-contract).
const openapiLive = S.Shell.Test({
  command: "node ./scripts/test-live-backend-openapi.mjs",
  data: [client.srcs, S.file("//scripts/test-live-backend-openapi.mjs")],
  sandbox: { network: true },
});

const openapiFixtureUnion = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/check-openapi-fixture-union.mjs"],
  data: [
    S.file("//scripts/check-openapi-fixture-union.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.gitDiff({
      paths: [
        "packages/client/test/fixtures/*.json",
        "packages/client/test/generated/backend-routes.ts",
      ],
    }),
  ],
});

const fixturePr = S.Agent.Pr({
  agent: S.Agents.luna,
  prompt: S.file("//prompts/fixture-refresh.md"),
  data: [
    repoScripts.updateBackendOpenapi,
    S.gitDiff({
      paths: [
        "packages/client/test/fixtures/*.json",
        "packages/client/test/generated/backend-routes.ts",
      ],
    }),
  ],
  changes: [
    "packages/client/test/fixtures/**",
    "packages/client/test/generated/**",
  ],
  gates: [openapiFixtureUnion, openapiContract, openapiLive],
  approval: "required",
});

const contractFixtureRefresh = S.Suite({
  tests: [
    repoScripts.updateBackendOpenapi,
    openapiFixtureUnion,
    openapiContract,
    openapiLive,
    fixturePr,
  ],
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit", "--project", "tsconfig.lib.json"],
  data: [react.srcs, S.file("//tsconfig.lib.json")],
});

const test = S.Shell.Test({
  bin: S.NodeModule.Bin("vitest"),
  args: ["run"],
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

const testWatch = S.Shell.Run({
  bin: S.NodeModule.Bin("vitest"),
  data: [srcs, S.file("//vitest.config.ts"), S.file("//vitest.setup.ts")],
});

const check = S.Suite({
  tests: [lint, typeCheck, test],
});

const checkApps = S.Suite({
  tests: [lintApps, typeCheckApps, portal.test, telegram.test, buildApps],
});

// What CI must hold green. Mirrors ci.yml's packages and apps jobs; the
// policy jobs stay GitHub-native (see .github/PACKAGE.ts). An unaffected
// target is a cache hit, which subsumes hand-maintained path filters.
const ci = S.Suite({
  tests: [
    check,
    checkApps,
    buildPackages,
    openapiContract,
    agentLints,
    deterministicLints,
  ],
});

// The tree-verification half of //.github:releaseTrain lives at the root so
// it is reusable without importing .github back into this package (which would
// create a declaration cycle). Git ref mutation and PR creation stay in the
// .github package.
const frontendReleaseTrain = S.Suite({
  tests: [ci, openapiLive, publishCoherence, registryBuildIntegrity],
});

const clean = S.Clean({
  paths: [
    ".next",
    "apps/landing/.next",
    "apps/base/.next",
    "dist",
    ".turbo",
    "node_modules/.cache",
    ".eslintcache",
  ],
});

const cleanApps = S.Clean({
  paths: ["apps/landing/.next", "apps/base/.next"],
});

// clean:next in //package.json: the Next build outputs only, never the
// package dists or the tool caches //:clean also removes.
const cleanNext = S.Clean({
  paths: [".next", "apps/landing/.next", "apps/base/.next"],
});

const cleanPackages = S.Clean({
  targets: [client.build, react.build, deploy.build, shadcnRegistry.build],
  paths: ["dist"],
});

const preCommit = S.Suite({
  tests: [lint, typeCheck],
});

const prePush = S.Suite({
  tests: [lint, typeCheck, test, portal.test, telegram.test, agentLints],
});

const retainCommit = S.Memory.Retain({
  source: S.gitCommit("HEAD"),
  tags: ["commit"],
});

const postCommit = S.Suite({
  tests: [retainCommit],
});

const commit = S.Git.Commit({
  gates: [preCommit],
  message: S.Agents.luna,
});

// Publishing the shadcn registry pushes static artifacts to the deployed
// landing site, so it is outward-facing and gated on approval.
const deployRegistry = S.Shell.Run({
  command: "./scripts/deploy-registry.sh",
  data: [shadcnRegistry.build],
  sandbox: { network: true },
  approval: "required",
});

// Prettier's config lives in package.json, so the manifest is key material.
const prettier = S.Shell.Test({
  bin: S.NodeModule.Bin("prettier"),
  args: ["--check", "."],
  data: [srcs, packageJson],
});

const prettierFix = S.Shell.Diff({
  bin: S.NodeModule.Bin("prettier"),
  args: ["--write", "."],
  data: [srcs, packageJson],
  changes: ["**"],
});

// repowiki is a repo-local binary, not a host tool. Its index output
// location is not documented, so the refresh runs without a declared write
// set until repowiki declares one.
const repowiki = S.Shell.Run({
  command: "./scripts/repowiki",
  data: [srcs, S.file("//repowiki.toml")],
});

const repowikiDoctor = S.Shell.Run({
  command: "./scripts/repowiki doctor",
  data: [S.file("//repowiki.toml")],
});

const repowikiRefresh = S.Shell.Run({
  command: "./scripts/repowiki refresh",
  data: [srcs, S.file("//repowiki.toml")],
});

const start = S.Shell.Serve({
  bin: S.NodeModule.Bin("next"),
  args: ["start"],
  data: [S.glob(["app/**", "src/**", "public/**"]), S.file("//next.config.ts")],
  readiness: { port: 3000 },
  stop: { signal: "SIGTERM", grace: "10s" },
});

// The local form of publish-npm-token.yml: packages green, then publish
// only the versions the registry lacks. Outward, so approval-gated.
const publish = S.Shell.Run({
  command:
    "node ./scripts/publish-package-if-needed.mjs packages/client && node ./scripts/publish-package-if-needed.mjs packages/deploy && node ./scripts/publish-package-if-needed.mjs packages/react && node ./scripts/publish-package-if-needed.mjs apps/shadcn-registry",
  gates: [buildPackages],
  secrets: [S.Secret("NODE_AUTH_TOKEN")],
  sandbox: { network: true },
  approval: "required",
});

// A registry release is complete only when the deployed item installs into a
// clean Next app and survives both tsc and next build.
const installSmoke = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["scripts/smoke-registry-install.mjs"],
  data: [
    shadcnRegistry.build,
    S.file("//scripts/smoke-registry-install.mjs"),
    S.file("//scripts/lint-utils.mjs"),
    S.gitDiff({ paths: ["apps/shadcn-registry/src/**"] }),
  ],
  // Run targets cannot be data producers: the loader rejects that edge.
  // A gate preserves the required deploy-before-install order and keeps the
  // real deployment's approval visible.
  gates: [deployRegistry],
  sandbox: { network: true },
});

const registryRelease = S.Suite({
  tests: [
    shadcnRegistry.build,
    registryBuildIntegrity,
    registryParityLint,
    releaseFanout,
    publish,
    deployRegistry,
    installSmoke,
  ],
});

const themeGen = S.Generate({
  script: S.file("//scripts/generate-theme.mjs"),
  data: [S.glob(["src/themes/**"])],
  changes: ["src/themes/**"],
});

// vercel-build decomposed: the library, registry, and landing builds are
// data edges, so Vercel's build command reduces to the file staging between
// them. The AOMI_ROOT_NEXT_OUTPUT/VERCEL_URL case in the original script
// only chose how landing was invoked; here landing.build is one target
// either way. package.json keeps the original vercel-build script because
// Vercel invokes it outside the graph.
const vercelBuild = S.Shell.Build({
  bun: 'await $`mkdir -p apps/landing/public/r && cp -r apps/shadcn-registry/dist/. apps/landing/public/r/`\nif (process.env.VERCEL === "1") await $`mkdir -p public/assets public/videos public/research && cp -r apps/landing/public/assets/. public/assets/ && cp -r apps/landing/public/videos/. public/videos/ && cp -r apps/landing/public/research/. public/research/`',
  data: [buildLib, shadcnRegistry.build, landing.build],
  outDirs: [
    "apps/landing/public/r",
    "public/assets",
    "public/videos",
    "public/research",
  ],
});

export const Package = S.Package({
  targets: {
    addBffRoute,
    addCliSubcommand,
    addEvmChain,
    agentLints,
    authStack,
    authStackSmoke,
    authStackStatus,
    authStackStop,
    bffRouteContract,
    bffRouteContractFix,
    buildAll,
    buildApps,
    buildControlPlaneSurface,
    buildLib,
    buildPackages,
    check,
    checkApps,
    ci,
    clean,
    cleanApps,
    cleanNext,
    cleanPackages,
    cliRegistrationParity,
    commit,
    contractFixtureRefresh,
    deployRegistry,
    deployContractExtension,
    deployStatusExhaustive,
    deterministicLints,
    engineNamesLint,
    envKeyParity,
    failClosedAuthorization,
    fixturePr,
    frontendReleaseTrain,
    installSmoke,
    lint,
    lintApps,
    openapiContract,
    openapiFixtureUnion,
    openapiLive,
    paymasterForwardedHost,
    postCommit,
    preCommit,
    prePush,
    prettier,
    prettierFix,
    publish,
    publishCoherence,
    registryBuildIntegrity,
    registryParityLint,
    registryRelease,
    releaseFanout,
    repowiki,
    repowikiDoctor,
    repowikiRefresh,
    retainCommit,
    secretHygieneLint,
    singleInstanceProviderSdk,
    srcs,
    start,
    test,
    testWatch,
    themeGen,
    typeCheck,
    typeCheckApps,
    vercelBuild,
  },
});
