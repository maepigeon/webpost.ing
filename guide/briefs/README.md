# Briefs

One file per worker, written before it is launched, so any run can be read
later or repeated exactly.

- **Name:** `YYYY-MM-DD-<agent-type>-<short-task>.md`, e.g.
  `2026-10-04-implementer-profile-summary.md`. The same name is the worker's
  name: use it as the `description` when launching, in status tables for Mae,
  and in commit messages for its work.
- **Contents:** the agent type and model; Mae's words for the task; the
  lead's design (why, rules, edge cases, what not to build); the only files
  it may edit; what the other workers in the batch own; how to verify; the
  report wanted. The standing rules are already in `.claude/agents/<type>.md`
  and are not repeated.
- **Launching:** the prompt is one line: "Your brief is
  `guide/briefs/<name>.md`. Read it and do it." To rerun or hand a task to a
  fresh worker, launch again with the same file (edit the brief first if the
  first run showed it was unclear, and say what changed at the bottom).
- **After:** append the worker's final report under a `## Result` heading
  (or a two-line summary and the commit hash), so the brief and its outcome
  stay together. Briefs are committed with the batch.
