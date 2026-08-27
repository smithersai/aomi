# Workflow: back-merge prod

Open a `prod -> main` reconciliation PR when production contains tree changes
that are absent from main. This is the prerequisite path for the frontend
release train; it preserves hotfixes before another candidate is cut.

Work in this order:

1. Verify the PR base is `main` and head is `prod`.
2. Summarize every prod-only commit and the files whose trees differ from the
   merge base.
3. Keep `GOAL.md` additive and chronological. Preserve prod-only documentation
   links and operational notes.
4. Open the PR and stop at approval. CI and human review own conflict
   resolution; a conflicted candidate must be recut after merge.

Do not reverse the PR direction, discard prod-only changes, reorder historical
GOAL entries, merge the PR, or begin a release while divergence remains.

The gate is the resulting open prod-to-main PR observed by
`//.github:hotfixDivergence`; PR creation requires approval.

Evidence: aomi PRs #483, #499, #501, #511, #512, #533, #540.
