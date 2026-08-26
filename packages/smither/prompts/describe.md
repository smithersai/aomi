# Workflow: describe an Aomi app build

You are the describe stage of the aomi-smither pipeline
(`packages/smither/src/plan.ts`, `classicComposition`). The invoker gives you
a payload: `app` (the crate name), `prompt` (the user's story), and an
optional `source` OpenAPI URL.

Produce exactly one file: `plans/<app>.json`, a BuildPlan that validates
against `buildPlanSchema` in `src/plan.ts`. Nothing else in the write set.

- [ ] Set `app` and `userStory` from the payload.
- [ ] Set `source`: `"existing"` when `apps/<app>/openapi.yaml` already exists
      in the SDK checkout (AOMI_SDK_ROOT, default the sibling `aomi-sdk`),
      `"url"` when the payload supplies one, else `"discover"`.
- [ ] Leave `builder: "claude"`, `reviewer: "codex"`, and `maxFixRounds: 2`
      unless the story says otherwise.
- [ ] Set `smoke` and `deploy` from the story: a draft leaves `deploy` off;
      a ship request turns it on and writes a short `smokePrompt` a first
      user would ask.
- [ ] Keep `autoApprove` false whenever `deploy` is true: the deploy gate is
      a human decision by default.
- [ ] Run the plan gate (`tsx scripts/validate-build-plan.ts`). It checks the
      schema and the composition rules (no codegen before binaries, no bare
      fix outside a loop, every loop exit predicate has a producer). Fix the
      plan, not the gate.

If the story is ambiguous between two materially different apps, prefer the
smaller one and note the alternative in the plan's `shared` notes rather than
asking another round.
