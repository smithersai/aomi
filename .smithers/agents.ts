/// <reference path="../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets";

// The smither builder defaults to the claude CLI routed through OpenRouter
// (SMITHER_OPENROUTER_API_KEY; model moonshotai/kimi-k2.7-code, overridable
// via SMITHER_OPENROUTER_MODEL) and its reviewer defaults to codex.
// packages/smither/src/agents.ts is the source of truth for that routing.
export const agents = S.Agents({
  default: S.Agent.ClaudeCode({ model: "moonshotai/kimi-k2.7-code" }),
  luna: S.Agent.Codex({ model: "luna" }),
  reviewPool: S.Agent.Pool(["luna", "default"]),
  sol: S.Agent.Codex({ model: "sol" }),
});
