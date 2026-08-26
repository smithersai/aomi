# Lint: engine names in product UI

The Build page renders Smithers engine runs as product stages
(`apps/build/src/features/build/smither-run-mapper.ts`). Its own contract:
never show engine names in UI labels. A user builds an Aomi app; they never
meet the machinery.

Findings:

1. **Engine vocabulary in user-facing strings.** "Smithers", "smither",
   "codex", "claude", "agent harness", or node ids like `validate-loop` in
   copy rendered by `apps/build` components: labels, toasts, empty states,
   stage titles, error messages.
2. **Raw node ids as labels.** A stage light or timeline row keyed directly
   on an engine node id instead of the `STREAM_TO_JOURNEY` /
   `stageKeyForNode` mapping.
3. **New engine references outside the mapper.** Engine names belong in
   `smither-run-mapper.ts` and `packages/smither`; a product component that
   imports engine vocabulary around the mapper.

Not findings: `data-testid` hooks, code identifiers and comments, the
mapper itself, `packages/smither` internals, docs and specs.

In check mode, report each finding with file and line. In fix mode, route
the string through the journey-stage vocabulary (describe, plan, generate,
compile & test, ship) and nothing else.
