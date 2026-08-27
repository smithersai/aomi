# Recipe: add an EVM chain

Add one EVM network across the canonical client catalog, SIWE verifier, wallet
kit, provider configuration, React user-state projection, tests, and registry
surface. The input names the chain id, native ticker and display decimals,
explorer, RPC/Alchemy slug, and testnet/mainnet status.

Work in this order:

1. Add one `defineChain` entry in `packages/client/src/chains.ts` and pin its
   id, ticker, and display decimals in the chain tests.
2. Permit the exact id in `packages/account/src/better-auth/siwe.ts`. Parse
   provider ids canonically: no `parseInt` prefix acceptance and no unsafe
   integers.
3. Wire the wallet-kit config, Privy config, registry selectors, and selector
   tests. Preserve synchronous `onUserStateChange` callbacks.
4. Add a monochrome `currentColor` chain mark and both icon maps. A clearly
   identified placeholder is acceptable when official art is unavailable.
5. Add the chain to Portal, Landing, and Docs provider configuration.
6. Carry it through React runtime utilities and external-user context.
7. Run the gates, then state in the result that the backend registry and
   staging seed must land before the frontend release. Hand versioning and
   generated fanout to `//:releaseFanout`.

Do not change an existing chain's units, make async state callbacks, add
provider secrets, edit registry output by hand, or publish/deploy. Keep the
write set to the paths declared by the target.

Required gates: `//packages/client:test`,
`//apps/shadcn-registry:build`, `//:registryParityLint`, and
`//:typeCheckApps`.

Evidence: aomi PRs #158, #166, #207, #218, #369, #381, #400, #452, #454, #474, #475, #476, #518.
