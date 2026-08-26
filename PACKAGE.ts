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

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit", "--project", "tsconfig.lib.json"],
  data: [react.srcs, S.file("//tsconfig.lib.json")],
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
  tests: [check, checkApps, buildPackages, openapiContract, agentLints],
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
    agentLints,
    authStack,
    authStackSmoke,
    authStackStatus,
    authStackStop,
    buildAll,
    buildApps,
    buildLib,
    buildPackages,
    check,
    checkApps,
    ci,
    clean,
    cleanApps,
    cleanNext,
    cleanPackages,
    commit,
    deployRegistry,
    engineNamesLint,
    lint,
    lintApps,
    openapiContract,
    openapiLive,
    postCommit,
    preCommit,
    prePush,
    prettier,
    prettierFix,
    publish,
    registryParityLint,
    repowiki,
    repowikiDoctor,
    repowikiRefresh,
    retainCommit,
    secretHygieneLint,
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
