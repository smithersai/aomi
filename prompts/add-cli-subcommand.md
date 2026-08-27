# Recipe: add a CLI subcommand

Add one reachable `aomi <noun> <verb>` command with its citty definition,
handler, tests, docs, and release handoff.

Work in this order:

1. Define the command in `packages/client/src/cli/commands/defs`. Do not spread
   `globalArgs` into a nested command unless the established sibling does.
2. Put behavior in `commands/<name>.ts`; map expected failures to stable
   `DeployCliError` codes and store durable state only through the `.aomi`
   state helper.
3. Register the definition in `root.ts` and keep `SUBCOMMAND_NAMES` identical
   to `root.subCommands`. Register nested verbs under their noun definition.
4. Reuse `watchDeployment` from `@aomi-labs/deploy`; do not create a polling
   loop that retries permanent 4xx responses.
5. Add focused CLI tests and declare any new test dependency in the package
   manifest.
6. Update the client README and the Landing CLI reference with only commands
   that the registration graph resolves. Hand dist and version work to
   `//:releaseFanout`.

Do not persist one-shot secrets, print credentials, document an unreachable
alias, re-declare the root command set in `main.ts`, publish, or change files
outside the declared write set.

Required gates: `//:cliRegistrationParity`, `//packages/client:test`, and
`//packages/client:build`.

Evidence: aomi PRs #62, #69, #70, #80, #84, #214, #232, #234, #235, #239, #243, #244, #246, #252, #467.
