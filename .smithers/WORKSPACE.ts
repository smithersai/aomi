/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";
import { Package as root } from "../PACKAGE.js";
import { agents } from "./agents.js";
import { sandboxes } from "./sandbox.js";

const packageJson = S.file("//package.json");
const lockfile = S.file("//pnpm-lock.yaml");
const workspaces = S.file("//pnpm-workspace.yaml");

const runtime = S.Runtime.Node({ manifest: packageJson });

// Intended: S.PackageManager.Pnpm({ manifest: packageJson, lockfile,
// workspaces, audit: { severity: "critical" } }) — the manifest/lockfile
// form, with pnpm-workspace.yaml's overrides as key material. The loader
// today ships only the Yarn declaration in that shape; its Pnpm form is the
// BUILD-era version pin used below. The version literal is the loader's
// enumeration, not the repo's pin (pnpm@10.28.0 in the manifest's
// packageManager field). Recorded in SMITHERS-NOTES.md. The lockfile and
// workspaces declarations above stay referenced here so the intent is one
// diff away when the form lands.
const packageManager = S.PackageManager.Pnpm({
  version: "11.21.0",
  runtime: S.Runtime.Node({ version: ">=22.19.0" }),
});

const nodeModules = S.Npm.NodeModules({ packageJson });

const flags = S.Flags({
  production: "--prod",
});

const host = S.Host({
  bins: [
    "aomi-build",
    "aomi-run",
    "actionlint",
    "cargo",
    "docker",
    "python3",
    "vercel",
    "zizmor",
  ],
});

const memory = S.Memory.SmithersCloud({
  bank: ["repo"],
  autoInject: 5,
});

export const Workspace = S.Workspace("aomi", {
  repository: "git+https://github.com/aomi-labs/aomi.git",
  cache: S.Cache({ directory: ".flows" }),
  runtime,
  packageManager,
  nodeModules,
  flags,
  host,
  memory,
  sandboxes,
  agents,
  gitHooks: {
    preCommit: root.preCommit,
    postCommit: root.postCommit,
    prePush: root.prePush,
  },
});
