# Workflow: OpenAPI fixture refresh PR

Open a fixture-only PR after the live production and staging OpenAPI documents
have been unioned with the checked-in contract. PR #503 is the source of the
rule: regeneration must never silently delete a route that a frontend rollback
still needs.

Work in this order:

1. Inspect only the fixture and generated-route diff emitted by
   `//scripts:updateBackendOpenapi`.
2. List added operations with method, path, operation id, and `x-aomi-auth`.
3. List removals only when a `Removed:` note is present in the commit body;
   list every auth-class change prominently.
4. Record the production and staging source URLs and the three gate verdicts.
5. Open the PR. Removal or auth changes are security-sensitive and must remain
   approval-gated; the target requires approval for every fixture PR so the
   stricter case cannot be bypassed by classification error.

Do not edit client implementation, hand-delete old operations, regenerate from
only one live environment, accept dangling `$ref` values, merge, or change
files outside the declared fixture/generated write set.

Required gates: `//:openapiFixtureUnion`, `//:openapiContract`, and
`//:openapiLive`.

Evidence: aomi PRs #225, #226, #231, #253, #256, #290, #377, #384, #396, #406, #434, #438, #484, #503, #528, #539.
