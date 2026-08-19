# StoneSiege coding-agent instructions

These instructions apply to the entire repository. A nested `AGENTS.md` may add stricter rules
for its subtree but may not weaken this workflow.

## Mandatory issue-first coordination

Every code, test, campaign, map, balance, art, audio, build, or documentation change must have
one public GitHub issue before implementation begins. Small fixes are not exempt. Read-only
investigation needed to find, reproduce, or describe the problem is allowed before the issue.

1. Confirm the contributor has a GitHub account and is signed in. Never create an account,
   request a password, or invent credentials.
2. Search open and closed issues for the same problem or proposal:

   ```bash
   gh issue list --repo Knorcedger/stonesiege --state all --search "<keywords>"
   ```

3. Search open pull requests for overlapping implementation:

   ```bash
   gh pr list --repo Knorcedger/stonesiege --state open --search "<keywords>"
   ```

4. If a matching issue exists, inspect its assignees, recent comments, and linked pull requests.
   If someone is actively working, coordinate in that issue and do not start a parallel version.
   If it is available, comment with the intended scope and ask to be assigned or assign yourself
   when permitted. If ownership looks abandoned, ask in the issue before taking it over.
5. If no matching issue exists, create one before editing files. State the player or contributor
   problem, focused scope, acceptance criteria, dependencies, and important tradeoffs. Do not
   create a duplicate issue merely to satisfy this rule.
6. Record the issue number and create a dedicated branch such as
   `contrib/<issue-number>-<short-description>`. Never commit contribution work directly to
   `main`.
7. The pull request must include `Closes #<issue-number>`, or `Refs #<issue-number>` if it
   intentionally delivers only part of the accepted issue. Do not open an unlinked PR.

If GitHub access is unavailable, stop before implementation and leave a concise issue proposal
for the user to publish. Local code is not a substitute for the coordination record.

## Required project context

Before editing, read `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
`docs/ARCHITECTURE.md`, and the design or asset documentation relevant to the issue. Inspect
`git status` and preserve work you did not create.

Keep simulation changes deterministic, keep presentation out of `packages/sim`, avoid
unnecessary dependencies, document asset provenance, add focused tests, and run `npm run check`
before requesting review. Sign off commits under the DCO with `git commit -s`.
