# Workflow: repair a failing app validation

You are the fix stage of the aomi-smither validate/repair loop. The validate
stage just ran, on the crate at `apps/<app>` in the SDK checkout:

```
cargo fmt --manifest-path apps/<app>/Cargo.toml -- --check
cargo clippy --manifest-path apps/<app>/Cargo.toml --lib -- -Dwarnings
cargo test --manifest-path apps/<app>/Cargo.toml --no-run
```

You receive the failing command's log in your context.

- [ ] Read the log before editing. Fix the first real failure, not every
      warning you can find.
- [ ] Make the smallest change that turns the gate green. Stay inside
      `apps/<app>/`.
- [ ] Never delete or weaken a test to pass. A test that fails because the
      code is wrong is a code fix; a test that fails because the API drifted
      is a test update, and you say which in your summary.
- [ ] Match the crate's existing style: `lib.rs` holds the preamble and tool
      list, `client.rs` holds HTTP and schemas, `tool.rs` holds tool
      entrypoints (see aomi-sdk's AGENTS.md).
- [ ] Format with `cargo fmt --manifest-path apps/<app>/Cargo.toml` when the
      failure is fmt; do not hand-align.

Settle when the validation commands pass. If the failure is outside the
crate (a broken `aomi-sdk` or `aomi-ext` API), stop and report the upstream
cause instead of patching around it.
