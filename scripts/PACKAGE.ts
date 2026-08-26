/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

const srcs = S.Filegroup({
  srcs: S.glob(["**"]),
});

// MCP acceptance smoke: SIWE login with an optional mirror into a local DB.
// The script's own rule is that it never prints credentials.
const smokeMcpChat = S.Shell.Test({
  bin: S.Runtime.bin,
  args: ["smoke-mcp-chat.mjs"],
  data: [srcs],
  sandbox: { network: true },
});

// Regenerate the committed backend OpenAPI fixture from a live backend.
// //:openapiLive is the drift gate that compares the fixture against the
// deployment. The write set crosses packages, so it is workspace-anchored.
const updateBackendOpenapi = S.Shell.Diff({
  bin: S.Runtime.bin,
  args: ["update-backend-openapi.mjs"],
  data: [srcs],
  changes: ["//packages/client/test/fixtures/backend-openapi.json"],
  sandbox: { network: true },
});

export const Package = S.Package({
  targets: { smokeMcpChat, srcs, updateBackendOpenapi },
});
