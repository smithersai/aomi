/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

const playwrightConfig = S.file("//playwright.config.ts");

const srcs = S.Filegroup({
  srcs: S.glob(["**"]),
});

// preview-e2e.yml: the two anonymous smoke specs (portal shell, build shell
// with the intent composer) against same-SHA Vercel previews.
// PORTAL_PREVIEW_URL/BUILD_PREVIEW_URL are CI-resolved invocation inputs,
// not key material.
const previewSmoke = S.Shell.Test({
  bin: S.NodeModule.Bin("@playwright/test", "playwright"),
  args: ["test"],
  data: [srcs, playwrightConfig],
  sandbox: { network: true },
});

// production-smoke.yml: the same specs against the production surfaces
// after a prod deploy.
const productionSmoke = S.Shell.Test({
  bin: S.NodeModule.Bin("@playwright/test", "playwright"),
  args: ["test"],
  data: [srcs, playwrightConfig],
  env: {
    PORTAL_PREVIEW_URL: "https://chat.aomi.dev",
    BUILD_PREVIEW_URL: "https://build.aomi.dev",
  },
  sandbox: { network: true },
});

export const Package = S.Package({
  targets: { previewSmoke, productionSmoke, srcs },
});
