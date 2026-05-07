# Agent Rule

## Only Show Useful Information

Product-facing output should be simple, direct, and useful to the user.

Before adding any text, card, metric, state, or explanation to the user interface, ask whether it helps the user understand the current result or complete the next action. If it does not, do not show it.

Prefer fewer words, fewer panels, and fewer choices. Hide internal process details unless the user explicitly needs them to make a decision.

## Record Development Process Before Commit

Before creating any commit, update the project development record.

Use `docs/project-evolution-timeline.md` as the default development-process document. If the work already has a more specific plan or review document under `docs/`, update that document as well when it better explains the change.

Each commit must leave enough written context for later review:

- What product or technical problem the commit addresses.
- The main frontend, backend, database, worker, model, or documentation changes.
- The verification commands that were run and their result.
- Known risks, follow-up decisions, or intentionally deferred work.

Do not expose this internal development record in product UI. This rule is only for repository documentation and commit hygiene.
