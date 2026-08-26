/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

const srcs = S.Filegroup({
  srcs: S.glob(["**"]),
});

// The golden Vercel Sandbox image behind AOMI_BUILD_RUNNER=vercel-sandbox
// (infra/build-runner/README.md). The docker daemon and the VCR registry
// login are host state, so the sandbox is fully open; the push is outward,
// so approval is required. AOMI_RUNNER_IMAGE comes from the invoking env.
const buildRunnerImage = S.Shell.Run({
  bun: "await $`${docker} buildx build --platform linux/amd64 --push -t ${process.env.AOMI_RUNNER_IMAGE!} build-runner`",
  using: { docker: S.Host.bin("docker") },
  approval: "required",
  sandbox: "none",
});

export const Package = S.Package({
  targets: { buildRunnerImage, srcs },
});
