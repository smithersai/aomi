# Lint: secret hygiene

AGENTS.md's security rules: never commit `.env` contents, never print
credentials, and funnel network or key material through the backend instead
of embedding it in the repo. `scripts/smoke-mcp-chat.mjs` sets the bar: it
handles a full login and never prints a credential.

Findings:

1. **Credential material in committed files.** Private keys, bearer tokens,
   session secrets, activation tokens, or `.env` values with real-looking
   content.
2. **Credential logging or echoing.** Code paths that print, post, or
   persist a secret beyond its intended envelope.
3. **Fixtures that look real.** Test or CI fixture values not obviously
   fake. The repo's own pattern is `ci-fixture-not-a-secret` and the zero
   hex project id in `.github/workflows/ci.yml`.

Not findings: `S.Secret(...)` declarations in PACKAGE.ts files, environment
variable names without values, documented placeholder values, the CI fixture
block itself.

In check mode, report file, line, and the exposure channel (committed,
logged, transmitted). In fix mode, replace the material with an obviously
fake placeholder and route the real value through the environment; never
rewrite history.
