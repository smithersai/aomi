/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as root } from "../PACKAGE.js";
import { Package as tests } from "../tests/PACKAGE.js";

const setup = S.Github.Setup({
  cacheUrl: S.Secret("SMITHERS_CACHE_URL"),
  cacheToken: S.Secret("SMITHERS_CACHE_TOKEN"),
});

// ci.yml's workflow-policy job as a target: actionlint plus zizmor over the
// workflows, including the generated ones.
const workflowPolicy = S.Shell.Test({
  bun: "await $`${python} .github/scripts/check-workflow-policy.py`\nawait $`${actionlint}`\nawait $`${zizmor} --min-severity high .github/workflows`",
  using: {
    python: S.Host.bin("python3"),
    actionlint: S.Host.bin("actionlint"),
    zizmor: S.Host.bin("zizmor"),
  },
  data: [S.glob(["workflows/**", "actions/**", "scripts/**"])],
});

// ci.yml's packages, apps, and workflow-policy jobs as one affected
// pipeline. The remaining jobs (promotion-policy, hotfix-divergence, and the
// all-checks aggregate) are GitHub-native branch logic over git refs, not
// tree checks, so they have no target equivalent; they are unexpressed here
// and recorded in SMITHERS-NOTES.md.
const ci = S.Github.Workflow({
  name: "ci",
  on: {
    pullRequest: true,
    push: { branches: ["main", "prod"] },
    workflowDispatch: true,
  },
  concurrency: {
    group: "ci-${{ github.ref }}",
    cancelInProgress: "pull_request",
  },
  setup,
  affected: true,
  run: [root.ci, workflowPolicy],
});

// preview-e2e.yml: the two anonymous smoke specs against same-SHA Vercel
// previews. Non-blocking upstream; the target itself is the verdict.
// preview-e2e-nightly.yml stays hand-written: S.Cron is the designed
// construct for schedule triggers (viem precedent) but is not in the
// loader yet, so the nightly workflow is preserved verbatim.
const previewE2e = S.Github.Workflow({
  name: "preview-e2e",
  on: { pullRequest: true },
  setup,
  run: [tests.previewSmoke],
});

// production-smoke.yml: after a prod deploy, the same specs against
// chat.aomi.dev and build.aomi.dev.
const productionSmoke = S.Github.Workflow({
  name: "production-smoke",
  on: { push: { branches: ["prod"] } },
  setup,
  run: [tests.productionSmoke],
});

// The drift-checked renderer. Hand-written workflows without target
// equivalents are preserved: the two manual npm publish pipelines, the
// manual rollback, and the nightly preview fallback.
const github = S.Github.CiGen({
  workflows: [ci, previewE2e, productionSmoke],
  preserve: [
    "workflows/preview-e2e-nightly.yml",
    "workflows/publish-npm-oidc-canary.yml",
    "workflows/publish-npm-token.yml",
    "workflows/rollback-frontend.yml",
  ],
  changes: ["workflows/**", "actions/setup/**"],
});

const pr = S.Github.Pr({
  gates: [root.prePush],
  secrets: [S.Secret("GITHUB_TOKEN")],
  sandbox: { network: true },
  approval: "required",
});

export const Package = S.Package({
  targets: { ci, github, pr, previewE2e, productionSmoke, workflowPolicy },
});
