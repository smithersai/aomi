/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as deploy } from "../deploy/PACKAGE.js";

const srcs = S.Filegroup({
  srcs: S.glob([
    "**",
    "!dist/**",
    "!node_modules/**",
    "!.smithers/**",
    "!plans/**",
  ]),
});

const build = S.Shell.Build({
  bin: S.NodeModule.Bin("tsup"),
  data: [srcs, deploy.build, S.file("tsup.config.ts")],
  outDirs: ["dist"],
});

const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["--noEmit", "--project", "tsconfig.json"],
  data: [srcs],
});

// --- The /build pipeline as a static target plan -------------------------
// apps/build's Create button drives exactly this chain through the BFF
// (apps/build/src/server/bff/build/engine.ts): plan -> codegen ->
// curate/fix -> validate -> smoke -> deploy-gate -> deploy. Every stage is
// a target, the plan is data, and the gates are cargo. Two honesty notes:
//
// 1. The generated crate lives in the sibling aomi-sdk checkout
//    (AOMI_SDK_ROOT, default ../aomi-sdk, so ../../../aomi-sdk from this
//    package). Write sets below name that tree, and the cargo stages run
//    with sandbox: "none" because the SDK checkout and cargo's cache are
//    host-coupled state outside this workspace. Modeling the SDK as a
//    workspace-declared dynamic resource: one network workflow syncs and
//    builds it, static dependents consume it offline, the node_modules
//    pattern is proposed API recorded in SMITHERS-NOTES.md.
// 2. AOMI_APP and AOMI_SMOKE_PROMPT arrive as invocation inputs of the
//    describe target's payload; the deterministic stages read them from the
//    approved plan at execution time.

// A plan is only real when it validates against the source of truth:
// buildPlanSchema plus compositionIssues in src/plan.ts.
const planLint = S.Shell.Test({
  bin: S.NodeModule.Bin("tsx"),
  args: ["scripts/validate-build-plan.ts"],
  data: [srcs, S.glob(["plans/**"])],
});

// describe -> typed BuildPlan. The agent emits plans/<app>.json and nothing
// else; planLint is the schema gate; maxRounds bounds the clarify loop the
// TUI and BFF drive through their decision endpoints.
const describeApp = S.Agent.Diff({
  prompt: S.file("prompts/describe.md"),
  payload: {
    app: S.Input.String("App name, e.g. geckoterminal"),
    prompt: S.Input.String(
      "User story for the app, e.g. track DEX pool prices",
    ),
    source: S.Input.Optional(
      S.Input.String(
        "OpenAPI URL; omit to discover, or to reuse apps/<app>/openapi.yaml",
      ),
    ),
  },
  data: [srcs],
  changes: ["plans/**"],
  gates: [planLint],
  maxRounds: 2,
});

// plan -> generated files. aomi-build new-app/gen-client/gen-tool is the
// Rust codegen; --all because runs are headless (the curate pass prunes).
// Idempotent per the smither's own guard: existing generated + curated
// sources are kept unless the plan sets force.
const generateApp = S.Shell.Diff({
  bun: "await $`${aomiBuild} new-app ${process.env.AOMI_APP!} --all`",
  using: { aomiBuild: S.Host.bin("aomi-build") },
  data: [describeApp],
  changes: ["../../../aomi-sdk/apps/**"],
  sandbox: "none",
});

// The validate half of the validate/repair loop: the same per-app cargo
// checks aomi-sdk CI runs for a changed app (AGENTS.md's validation list).
const validateApp = S.Shell.Test({
  bun: 'const manifest = `${process.env.AOMI_SDK_ROOT ?? "../../../aomi-sdk"}/apps/${process.env.AOMI_APP}/Cargo.toml`\nawait $`${cargo} fmt --manifest-path ${manifest} -- --check`\nawait $`${cargo} clippy --manifest-path ${manifest} --lib -- -Dwarnings`\nawait $`${cargo} test --manifest-path ${manifest} --no-run`',
  using: { cargo: S.Host.bin("cargo") },
  data: [generateApp],
  sandbox: "none",
});

// The repair half: the failing validation log goes into the prompt, the
// edit is confined to the crate, and the gate re-runs until green or
// maxRounds exhausts. smither's loop phase is this pair with an `until:
// validation-green` predicate and an onMax policy.
const fixApp = S.Agent.Diff({
  prompt: S.file("prompts/fix.md"),
  data: [generateApp, srcs],
  changes: ["../../../aomi-sdk/apps/**"],
  gates: [validateApp],
  maxRounds: 3,
});

// compile + one real agent turn against the built cdylib. aomi-run loads
// the plugin and answers the smoke prompt; the exit code is the verdict.
const smokeApp = S.Shell.Test({
  bun: 'await $`${aomiBuild} compile --app ${process.env.AOMI_APP!}`\nawait $`${aomiRun} --prompt ${process.env.AOMI_SMOKE_PROMPT ?? "reply with ok"}`',
  using: {
    aomiBuild: S.Host.bin("aomi-build"),
    aomiRun: S.Host.bin("aomi-run"),
  },
  data: [generateApp],
  gates: [fixApp],
  sandbox: "none",
});

// The deploy gate made structural: approval is required, the activation
// token is a named secret, and both cargo gates must be green immediately
// before the outward action. `aomi-build deploy --json` sends the
// source-bound deploy request; the platform repo's CI builds the release
// cdylib from there.
const shipApp = S.Shell.Run({
  bin: S.Host.bin("aomi-build"),
  args: ["deploy", "--json"],
  approval: "required",
  gates: [validateApp, smokeApp],
  secrets: [S.Secret("AOMI_APP_ACTIVATION_TOKEN")],
  sandbox: "none",
});

export const Package = S.Package({
  targets: {
    build,
    describeApp,
    fixApp,
    generateApp,
    planLint,
    shipApp,
    smokeApp,
    srcs,
    typeCheck,
    validateApp,
  },
});
