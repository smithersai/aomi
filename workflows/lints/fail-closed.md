# Lint: fail-closed authorization

Authorization and ownership gates must deny when verification is missing,
ambiguous, or unavailable. This is the fail-closed rule established by the
security guidance in AGENTS.md and repeatedly repaired in PRs #233, #243,
#336, #357, #386, #387, #491, #516, and #537.

Review the supplied diff in this order:

1. Find catch and fallback branches around authorization, ownership, required
   secrets, provider identity, acting wallets, and thread selection.
2. Trace the returned value into its consumer. Report a fallback only when it
   grants access, reports success, or erases a blocking requirement after the
   verification failed.
3. Reject missing-owner logic that treats `undefined` or `null` as the caller.
4. Reject row-order inference for the acting wallet or thread. The only safe
   resolution order is explicit selection, current session selection, a sole
   unambiguous item, then a structured `*_required` stop.
5. Report the exact file and line, the permissive value, and the downstream
   action it incorrectly enables.

Do not rewrite code, broaden the diff, infer product policy, or flag ordinary
read-only degradation whose consumer remains blocked. This lint has no fix
mode because the correct authority source requires review.

The gate is `//:failClosedAuthorization`; it passes only when the changed
authorization paths deny or stop on every unresolved state.

Evidence: aomi PRs #233, #243, #336, #357, #386, #387, #491, #516, #537.
