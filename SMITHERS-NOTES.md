# SMITHERS-NOTES.md

Smithers Factory encoding of aomi-labs/aomi, 2026-08-26. Companion to
aomi-sdk's SMITHERS-RUST-NOTES.md. Everything here is design-partner code:
the graph loads for real (121 targets, zero warnings) and every gap is
recorded, not hidden.

## The real graph

Verified 2026-08-26 with
`node /Users/williamcory/flows/flows/packages/build-cli/src/main.js`:

- `query '//...'` from the repo root: **121 targets**, classified edges
  (`data`, `gates`, `services`, `deps`), `warnings: []`.
- `query 'deps(//packages/smither:shipApp)'`: 7 dependencies:
  describeApp, fixApp, generateApp, planLint, smokeApp, srcs,
  validateApp; gates edges to smokeApp and validateApp.
- `query 'deps(//apps/build:build)'`: 11 dependencies: the app srcs plus
  the client, deploy, react, smither, and shadcn-registry build chain.
- `graph '//:ci'`: the ci suite fans out to agentLints, buildPackages,
  check, checkApps, and openapiContract.
- `test //:typeCheck` **ran green through the real executor** (tsc over
  tsconfig.lib.json, 1.75 s, content key recorded).
- `test //packages/smither:planLint` failed honestly: tsx cannot create
  its IPC pipe under the default no-network sandbox
  (`EPERM ... listen .../tsx-501/*.pipe`). The plan gate is pure
  validation; it needs either a loopback-allowing sandbox or a node-native
  runner. Recorded, not worked around.
- `graph '//...'`: full text graph rendered; the app build chain, the
  agent lint suite, and the Build-page pipeline all visible.

What is encoded:

- **Install/runtime**: `.smithers/WORKSPACE.ts`: Node runtime from the
  manifest, pnpm package manager (see the Pnpm note below), node_modules,
  flags (`--prod`), host bins (aomi-build, aomi-run, actionlint, cargo,
  docker, python3, vercel, zizmor), SmithersCloud memory, sandboxes,
  agents (claude via OpenRouter kimi as default, codex as luna), git
  hooks bound to `//:preCommit`, `//:postCommit`, `//:prePush`.
- **Ordinary automation**: per-app packages (landing, base, portal,
  aomi-build, telegram, shadcn-registry, widget-consumer) with build
  (next/tsup/tsx), dev servers with readiness/health/stop, lint,
  typeCheck (next typegen composed where the app does it), tests;
  per-package packages (service, account, client, react, deploy, smither,
  bff-observability); root suites mirroring `build:packages`,
  `build:apps`, `check`, `check:apps`, and ci.yml's two jobs;
  `//:vercelBuild` decomposing the vercel-build script; `//:buildLib` for
  the root tsup build; clean targets; openapi contract (fixture) and
  live (deployed backend) targets; repowiki targets; auth-stack service
  with the smoke test as a `services:` dependent.
- **Agent automation**: `//:agentLints` (engineNamesLint,
  registryParityLint, secretHygieneLint with `fixes:` write sets and
  prompts in `workflows/lints/`), and the central demo: the Aomi Build
  pipeline in
  `packages/smither/PACKAGE.ts`:
  `describeApp` (S.Agent.Diff, typed payload, emits `plans/<app>.json`,
  gated on `planLint` against the real `buildPlanSchema`, maxRounds 2) →
  `generateApp` (aomi-build codegen) → `validateApp` (cargo fmt/clippy/
  test trio) → `fixApp` (repair agent, gated, maxRounds 3) → `smokeApp`
  (compile + aomi-run) → `shipApp` (deploy, approval required, named
  secret, both gates green). `//apps/build:buildPipeline` aliases it.
  The page Cecilia named drives exactly this plan.
- **CI generation**: `.github/PACKAGE.ts`: ci, preview-e2e, and
  production-smoke as `S.Github.Workflow`, `S.Github.CiGen` with the two
  publish pipelines, the rollback, and the nightly fallback in
  `preserve`; the workflow-policy job as a target.
- **Deploys**: per-app Vercel deploys as approval-gated runs with named
  secrets; registry deploy gated on the registry build; the Vercel
  Sandbox build-runner image in `infra/PACKAGE.ts`; npm publish as an
  approval-gated run.
- **Script delegation**: every package.json leaf script is now
  `npx smithers <label>` following force's delegation commit. Retained
  verbatim: `vercel-build` (Vercel invokes it), `postinstall`
  (fumadocs-mdx; pnpm/Vercel invoke it), dev port/ngrok/localhost
  variants, `start*`, `prepublishOnly`, per-app `clean:dist` (chained by
  the retained root clean scripts' dependents), telegram's `check`
  composite. Where delegation would otherwise have changed a script's
  behavior, a target was added instead of the behavior dropped:
  `//:cleanNext` for `clean:next` (the Next outputs only, not
  `//:clean`'s dists and tool caches), `//:testWatch` for the root
  `test` (watch mode, not `vitest run`), and
  `//apps/telegram:testUnit` for `test:telegram` (the node:test files
  only, which is what ci.yml's apps job invokes). `dev:landing:live`
  keeps a literal `tsup --watch` because no watch attr exists.

## PR-history-mined targets (2026-08-27)

The 632-PR mining synthesis adds 30 loadable targets (151 total, zero
warnings) without hiding the defects that motivated them:

- **Deterministic lints:** `//:bffRouteContract` and its mechanical
  `//:bffRouteContractFix` (PRs #205, #207-#209, #233, #237, #238),
  `//:publishCoherence` (#104, #191, #218, #227, #369, #387, #494,
  #505, #509, #510, #517), `//:singleInstanceProviderSdk` (#419, #454,
  #456, #471), `//:deployStatusExhaustive` (#210, #221, #244, #247,
  #267), `//:paymasterForwardedHost` (#135),
  `//:registryBuildIntegrity` (#32, #33, #35, #67, #87, #88, #91,
  #135, #450, #538), and `//:envKeyParity` (#68, #132, #135, #205,
  #241, #243, #248, #276, #302, #312, #398, #404). They are grouped
  by `//:deterministicLints`, which `//:ci` now includes. The existing
  `//:agentLints` suite is unchanged; the judgement-based
  `//:failClosedAuthorization` lint is separate (#233, #243, #336,
  #357, #386, #387, #491, #516, #537).
- **Recipes:** `//:releaseFanout`, `//:addEvmChain`,
  `//:deployContractExtension`, `//:addBffRoute`,
  `//:buildControlPlaneSurface`, and `//:addCliSubcommand` encode the
  repeated edit sequences and exact write boundaries cited by those same
  PR families. `//:cliRegistrationParity` is the new deterministic gate
  for the CLI recipe.
- **Release workflows:** `//.github:releaseTrain` and
  `//:frontendReleaseTrain` reproduce the frontend release/backmerge
  gates (#124, #131, #187, #196, #204, #342, #354, #368, #392,
  #481-#483, #499-#502, #511, #512, #533, #540);
  `//:registryRelease` and `//:installSmoke` encode the registry build,
  publish, deploy, and clean-install proof (#27, #28, #32, #33, #35,
  #87, #88, #104, #135, #450, #538); and
  `//:contractFixtureRefresh`, `//:openapiFixtureUnion`, and its fixture
  PR lane preserve both production and staging OpenAPI operations (#225,
  #226, #231, #253, #256, #290, #377, #384, #396, #406, #434, #438,
  #484, #503, #528, #539).

The client, deploy, React, and registry package builds now state their package
cwd explicitly because package-mode commands execute at repository root. This
prevents a package `tsup` gate from accidentally loading the root config and
passing against stale tracked output. The registry build is unsandboxed but
offline: `tsx` needs a host-temp IPC socket that macOS `sandbox-exec` denies.
The private root build now emits to the root manifest's declared `dist/`.
Together these changes make the release workflow's build gates real and let
`//:registryBuildIntegrity` report the tree's registry defects instead of being
skipped behind a broken prerequisite.

## API symbols used here that neither force nor optimism uses

Specified in one line each; all are proposed, and none weakened the
graph: where the loader lacks a construct, the file says so in a
comment and the intended form stays recorded here.

- `S.PackageManager.Pnpm({ manifest, lockfile, workspaces, audit })`:
  WORKSPACE.ts manifest/lockfile form for pnpm, with
  pnpm-workspace.yaml's overrides as key material. viem uses the same
  intended form. The loader today ships only the Yarn declaration in
  this shape plus a BUILD-era version-pinned Pnpm; `.smithers/
  WORKSPACE.ts` uses the version-pinned form (`11.21.0` is the loader's
  enumeration, not the repo's pnpm@10.28.0 pin) and records the intended
  form in its comment.
- Dynamic cross-repo resource for the aomi-sdk checkout (no constructor
  exists): one network workflow syncs and builds the SDK
  (`AOMI_SDK_ROOT`), static dependents consume it: the factory model's
  node_modules rule. Today the smither pipeline declares the write set
  (`../../../aomi-sdk/apps/**`) and `sandbox: "none"` instead.
- Typed BuildPlan as a graph value: expressed with existing pieces
  (`S.Agent.Diff` payload + `planLint` schema gate over the real zod
  schema + `scripts/validate-build-plan.ts`), so no new symbol was
  needed. Workflow recursion (a plan emitting a per-app plan) is the
  factory construct this stands in for.
- `S.Cron({ schedule, run })`: viem's precedent for schedule triggers;
  preview-e2e-nightly stays preserved until it lands (comment in
  `.github/PACKAGE.ts`).

Everything else is force/optimism vocabulary: Shell.Test/Run/Diff/Build/
Serve, Generate (bin/script/emit forms), Suite, Alias, Filegroup,
ImportClosure-free globs with generated-output negations, Agent.Lint/
Diff, Git.Commit, Github.Setup/Workflow/CiGen/Pr, Memory.SmithersCloud/
Retain, Clean, Secret, Host.bin, NodeModule.Bin, Runtime.bin, Flags,
gitDiff.

## Unexpressed behavior

- **specs/, docs/, memory/, demo/, output/, artifacts/** carry no build
  role (product specs, session logs, and generated captures), so no
  PACKAGE.ts was added for them. If a spec-check target is ever wanted,
  the agentic lint suite is the pattern.
- **ci.yml's policy jobs** (promotion-policy, hotfix-divergence,
  all-checks) are branch-protection logic over git refs, not tree
  checks. They have no target equivalent; generated ci.yml would drop
  them unless they move to a preserved policy workflow or a job-level
  CiGen API arrives.
- **Vercel preview URL resolution** (`.github/scripts/
  resolve-preview-urls.sh`) feeds Playwright env; invocation inputs, not
  key material: noted on the tests targets.
- **The smither run-state backend** (PGlite/postgres under
  `.smithers/runs`) is runtime state, not build graph. The workspace
  cache directory is `.flows`; recommend `SMITHER_RUNS_ROOT` stay
  outside it.
- **`dev:landing:live`'s tsup watch + dev composition**: a watch-mode
  pair; encoded as separate targets (buildLib, landing dev), retained
  as a compatibility script.
- **repowiki's index output** is undocumented; the repowiki targets
  declare no write set until the tool declares one (comment on
  `//:repowiki`).
- **OpenAPI fixture auto-refresh** (update-backend-openapi on backend
  deploys) is cross-repo: the trigger lives in product-mono.

## product-mono access failure (exact)

```
$ git clone git@github.com:aomi-labs/product-mono.git /Users/williamcory/artsy/product-mono
Cloning into '/Users/williamcory/artsy/product-mono'...
remote: Repository not found.
fatal: repository 'https://github.com/aomi-labs/product-mono.git/' not found
```

Expected: roninjin10's org invitation is unaccepted, so the private repo
404s over SSH. Not accepted, per instructions. product-mono receives the
same treatment when reachable: the public Rust repos here are stand-ins
(see "Deferred cross-repo work").

## Loader refusals encountered (exact)

During authoring, all fixed by correcting our own declarations; the
loader was never patched:

1. `module_import_failed: evaluating the workspace's declaration modules
   failed: rootSrcs is not defined`: a const was renamed without
   updating the export map (declaration order/TDZ class).
2. `undeclared_host_bin: S.Host.bin("python3") names no binary in the
   workspace S.Host({ bins }) declaration`: fixed by declaring
   `python3` in `.smithers/WORKSPACE.ts`.
3. Two schema violations caught before load: `readiness: { port, timeout }`
   is not a legal Serve readiness (port form takes no timeout): fixed
   to `{ port }` with a `health` contract.
4. Non-blocking substitution, recorded above: the Pnpm
   manifest/lockfile form does not exist, so the version-pinned form is
   used.

The aomi-sdk refusals (different repo, same session) are recorded in
aomi-sdk/SMITHERS-RUST-NOTES.md: `S.Cargo.Fetch is not a function` at
the full-fidelity root, with `demo/loadable/` as the minimal loadable
entry.

## Deferred cross-repo work

- **product-mono (Rust backend)**: same Smithers treatment when
  reachable: it owns the OpenAPI the fixture regenerates from, the
  repowiki binary `scripts/repowiki` invokes, the local auth stack's
  backend, and the `api.aomi.dev` contract CI gates promotion on. Its
  encoding is the natural third repo of this demo.
- **community-apps**: inspected and intentionally not encoded. It is not
  a Cargo workspace: no root manifest; it is the release-builder that
  stages single-crate cdylib apps under `apps/<installation-id>/<app>/`
  and builds them in GitHub Actions. Those shapes (per-app cdylib
  release CI, manifest-driven staging) are already present in aomi-sdk's
  encoding (`//:pluginsLinux`, `//:pluginsDarwin`, the AppSet algebra),
  so it adds nothing the SDK repo lacks. Revisit as the platform-side
  consumer of `aomi-build deploy` when the SDK graph is real. Cloned,
  unmodified, no branch, no commits.
- **OpenAPI fixture bot**: on each backend deploy, regenerate
  `packages/client/test/fixtures/backend-openapi.json`, run
  `//:openapiContract`, automerge when green. Needs the product-mono
  deploy hook.
- **Registry publish chain**: on landing deploy, copy registry assets
  (`//apps/landing:registryAssets` semantics today live in
  `//:vercelBuild`) and verify `aomi.dev/r` serves the new manifest.
- **`.claude` generation**: force generates `.claude/` and CLAUDE.md
  from `workflows/` sources; aomi's `.claude`, `.agents`, and `.codex`
  trees are hand-written and are a generation candidate once the
  prompts here stabilize.
- **publish-npm-token.yml promotion**: the manual publish workflow and
  its `verify-main-ci.sh` precondition could become a
  `S.Github.Workflow` once CiGen models manual dispatch inputs
  (`candidate_sha`).
