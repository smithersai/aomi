# Recipe: build a control-plane surface

Add one Aomi Build page or deployment tab with its route, view, BFF read model,
navigation, deep link, vocabulary, and focused regression coverage.

Work in this order:

1. Add the route under `apps/build/src/app/(control-plane)` or the named tab
   under the deployment tabs.
2. Put the view in `apps/build/src/features/<area>` with a focused test and an
   empty state containing exactly one actionable CTA.
3. Add the owning BFF route and test through `DeploymentClient`, plus one path
   constant in `lib/api-paths.ts`.
4. Register command-palette, deep-link, and shell navigation entries. Preserve
   existing `?tab=` and `?project=` parameters.
5. Use the glossary's Project, App, Deployment, Environment, Provider, Live,
   and Soon terms. Mark fixture-backed sections visibly as Example data.
6. Record the new surface in `specs/STATE.md`.

Do not make an unfinished action appear successful, show fake connected/live
states, derive live status a second way, drop unrelated deep-link parameters,
or bypass the login-scoped shell cache. Soon-gated actions stay disabled.

Required gates: `//apps/build:test`, `//apps/build:lint`,
`//:engineNamesLint`, and `//:typeCheckApps`.

Evidence: aomi PRs #315, #316, #318, #319, #320, #322, #323, #325, #326, #330, #331, #334, #335, #337, #340, #362, #388, #395.
