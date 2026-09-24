---
name: changelog
description: Use for writing, reviewing, editing, or generating Meteor release changelog entries. Defines canonical file locations, naming rules, required section structure, formatting conventions, release-diff and milestone reconciliation, contributor and reporter attribution, PR-based generation workflow, incremental updates, and common entry patterns. Applies to files under v3-docs/docs/generators/changelog/versions/.
---

# Meteor Changelog Rules

Guidelines for authoring and generating Meteor release changelog entries.

## Source of Truth

All changelog files live in:

```
v3-docs/docs/generators/changelog/versions/
```

These files are consumed by a generator that produces the public changelog.
**Never edit generated output directly.**

Special file: `99999-generated-code-warning.md` (page header). Do not change its structure.

---

## File Naming

* One file per release
* Format: `MAJOR.MINOR.PATCH.md`
* No `v` prefix
* No suffixes or metadata

Examples:

* ✅ `3.4.0.md`
* ❌ `v3.4.0.md`
* ❌ `3.4.0-final.md`

---

## Required Entry Structure

All sections are required and must appear **in this exact order**.
Use `N/A` when a section has no content.

**Major / minor releases** (`X.0.0`, `X.Y.0`) — use subheaders under Highlights:

````markdown
## v<VERSION>, <YYYY-MM-DD>

### Highlights

#### Features

- New capability or API

#### Improvements

- Enhancement to existing behavior

#### Fixes

- Bug fix

#### Breaking Changes
N/A

#### Internal API changes
N/A

#### Migration Steps
Please run the following command to update your project:

```bash
meteor update --release <VERSION>
```

#### Bumped Meteor Packages

* package@version

#### Bumped NPM Packages

N/A

#### Special thanks to

N/A
````

**Patch releases** (`X.Y.Z`, Z > 0) — flat list, no subheaders:

````markdown
### Highlights

- Summary of change
````

---

## Formatting Rules

### Version Header
- Format: `## vX.Y.Z, YYYY-MM-DD`
- Comma + space separator
- Always H2
- Update the date to the current date whenever the changelog is modified

### Highlights

**Major / minor** — group entries under `#### Features`, `#### Improvements`, `#### Fixes` (H4 subheaders inside Highlights). Omit a subheader only if it would be empty.

**Patch** — flat bullet list, no subheaders.

General rules:
- Bullet list (`-`), concise, imperative voice
- Include PR links inline

```markdown
- Upgrade to Node v22, [PR#13997](...)
````

For large features, use nested bullets with emoji markers:

```markdown
- **Meteor-Rspack Integration**, [PR#13910](...)
  - ⚡ New `rspack` atmosphere package
  - 📦 New `@meteorjs/rspack` npm package
```

For feature-heavy releases, append:

```markdown
All Merged PRs@[GitHub PRs X.Y](https://github.com/meteor/meteor/pulls?q=is%3Apr+is%3Amerged+base%3Arelease-X.Y)
```

External package changelogs go after the PR link block.

---

### Breaking Changes

* Use `N/A` if none
* Package-level changes:

    * Backtick package names
    * List affected APIs
* Non-package changes use plain bullets

---

### Migration Steps

* Always start with:

```bash
meteor update --release <VERSION>
```

* Add extra commands, config steps, or doc links if needed

---

### Bumped Packages

**Meteor & NPM**

* One package per line
* Format: `name@version`
* No backticks
* Use `N/A` if empty
* Include `meteor-tool@<version>` when applicable

---

### Special Thanks

* Wrap contributor list with `✨✨✨`
* GitHub users:
  `[@user](https://github.com/user)`
* Forum users:
  `[@user](https://forums.meteor.com/u/user/summary)`
* Credit shipped PR authors and preserved source contributors first
* Credit substantive reviewers and PR participants next
* Credit issue reporters, reproduction authors, diagnosticians, and production
  confirmation contributors after them
* Deduplicate each person and keep them in the highest applicable group
* Do not credit bots, automation, or administrative-only participation
* Do not require an evidence link in Highlights to credit a qualifying person
* Use `N/A` if none

---

## Linking Conventions

* PR: `[PR#123](https://github.com/meteor/meteor/pull/123)`
* Docs: `[text](https://docs.meteor.com/...)`
* External changelog: `[pkg@ver](url)`
* All PRs: `[GitHub PRs X.Y](...)`
* Agent Skills release: `[vA.B.C](https://github.com/meteor/agent-skills/releases/tag/vA.B.C)`

### Meteor Agent Skills

Add a dedicated `#### Meteor Agent Skills` section only when a new coordinated
[`meteor/agent-skills`](https://github.com/meteor/agent-skills) catalog tag is actually
published for this Meteor release and its exact-tag remote installation tests pass.
Place it after the All Merged PRs and external package changelog links, before Breaking
Changes. If the Agent Skills version was not bumped for this Meteor release, omit the
heading entirely; do not add an `N/A` placeholder.

For a Meteor beta or RC, use this concise, client-neutral section:

````markdown
#### Meteor Agent Skills

This Meteor prerelease was tested with [Agent Skills vA.B.C-beta.N](https://github.com/meteor/agent-skills/releases/tag/vA.B.C-beta.N).

Install or update Meteor Agent Skills:

```bash
npx skills@latest add 'meteor/agent-skills#vA.B.C-beta.N'
```

See the [Meteor Agent Skills guide](https://docs.meteor.com/ai/agent-skills) for more
installation options.
````

For an official Meteor release, use the same template but change `prerelease` to
`release` and replace the beta tag in both the release link and installation command
with the exact verified stable `vA.B.C` tag.

This section tracks coordinated release metadata, not a Meteor code change. Do not put
the catalog version under Features, Improvements, Fixes, Bumped Packages, or Special
thanks. Do not use this section to list independent Agent Skills releases that are not
paired with the Meteor release represented by the changelog.

For a Meteor beta or RC, record the exact verified Agent Skills beta tag. For the
official release, use the verified stable tag instead of retaining multiple candidate
links. Do not add a planned, failed, missing, locally tested-only, or previously
recorded tag. The Agent Skills catalog has independent semver; never infer its version
from the Meteor version.

The `#vA.B.C[-beta.N]` ref forces the catalog tag while keeping the installation
client-neutral. Before publishing the changelog, test the displayed command with the
current `skills` npm release, verify the installed files match the tag, and verify that
the release and official guide links resolve. Keep client-specific commands in the
linked Agent Skills release notes instead of expanding the Meteor changelog.

When rerun, `skills add` replaces each selected existing skill directory and updates
its `skills-lock.json` ref. It leaves installed skills that the user does not select in
place; do not describe the command as removing or synchronizing the whole catalog.

---

## Common Highlight Patterns

* Dependency upgrade
* Bug fix
* New feature
* Package integration
* Deprecation
* Dependency-only bump
* Async API migration

---

## Branching Model & Comparison Baseline

Meteor releases are prepared on **`release-<VERSION>`** branches (e.g., `release-3.4.1`). The main development branch is **`devel`**.

- **Changelog scope** = all changes on `release-<VERSION>` that are not on `devel`
- **PR base** = PRs merged with base `release-<VERSION>`
- **Commit diff** = `git log devel..release-<VERSION>` or `git log devel..HEAD` when on the release branch

When generating or updating a changelog, always compare against `devel` to determine what is new in the release. PRs merged into `devel` that were then merged into the release branch via a branch merge (e.g., `Merge branch 'devel' into release-X.Y`) are included — they are part of the release diff.

---

## Generating a Changelog from PRs

Use merged PRs targeting the release branch.

### Fetch PRs

**Primary — `gh` CLI:**

```bash
gh pr list --repo meteor/meteor \
  --base release-<VERSION> \
  --state merged \
  --limit 200 \
  --json number,title,labels,author,body,url
```

**Fallback — when `gh` is unavailable:**

Use WebFetch to retrieve the PR list from GitHub:

```
https://github.com/meteor/meteor/pulls?q=is%3Apr+is%3Amerged+base%3Arelease-<VERSION>
```

Or fetch JSON from the GitHub REST API:

```
https://api.github.com/repos/meteor/meteor/pulls?base=release-<VERSION>&state=closed&per_page=100
```

Filter results to only merged PRs (`merged_at` is not null).

### Build the Release Scope and Attribution Inventory

Do not treat the base-branch PR list as exhaustive. Reconcile four evidence sets
before drafting or updating Highlights:

1. The `devel...release-<VERSION>` diff and commit history, which determine what
   actually ships.
2. Merged PRs whose base is `release-<VERSION>`, which are the primary entry points.
3. Every open and closed item in the release milestone, which can reveal reports,
   reproductions, pending work, and PRs merged through another base branch.
4. Linked issues and recursively referenced source, continuation, replacement, or
   superseded PRs found in PR bodies, issue bodies, comments, reviews, and commits.

Resolve the milestone and list all its items:

```bash
MILESTONE_NUMBER="$(gh api --paginate \
  'repos/meteor/meteor/milestones?state=all&per_page=100' \
  --jq '.[] | select((.title == "Release <VERSION>") or (.title == "<VERSION>")) | .number')"

gh api --paginate \
  "repos/meteor/meteor/issues?milestone=${MILESTONE_NUMBER}&state=all&per_page=100" \
  --jq '.[] | {number, title, state, author: .user.login, is_pr: has("pull_request"), url: .html_url}'
```

If no milestone exists, record that fact and continue with the other evidence sets.
Do not create or change a milestone as part of changelog generation.

For every candidate PR and recursively linked source PR, inspect full context:

```bash
gh pr view <PR_NUMBER> --repo meteor/meteor \
  --json number,title,author,body,url,files,comments,reviews,closingIssuesReferences,commits

gh issue view <ISSUE_NUMBER> --repo meteor/meteor \
  --json number,title,author,body,url,state,comments
```

Follow explicit links and relationship language such as `Fixes`, `Closes`, `Related`,
`Continues`, `Replaces`, `Supersedes`, `based on`, and statements that original
commits or authorship were preserved. Continue until every shipped change has an
origin and every directly related report has been checked.

Create and show two review artifacts before editing the changelog:

* **Scope discrepancy table:** classify each item as shipped, attribution-only,
  excluded with a reason, or unresolved/deferred. Include base-only, milestone-only,
  linked-source-only, and diff-only items. A milestone entry is discovery evidence,
  not proof that code shipped.
* **Attribution ledger:** list each human GitHub handle, role, and supporting PR or
  issue. Cover shipped PR authors, preserved source contributors, substantive
  reviewers and PR participants, issue reporters, reproduction authors, root-cause
  diagnosticians, and independent production confirmations.

Require an explicit user decision for unresolved milestone items before finalizing
the changelog. Do not put unresolved or deferred work in Highlights. Exclude bots,
automation accounts, administrative-only participation, and comments that do not
materially contribute to the shipped change.

Keep the evidence inventory separate from the public changelog. It supports scope
decisions and attribution, but it is not changelog content. In Highlights, link the
primary implementation or consolidation PRs. Add an issue or source PR only when it
materially helps users understand the impact, migration, or origin and the entry stays
concise. Do not copy the full issue and source-PR trace into Highlights merely to
justify Special thanks.

### Incremental Updates

When the changelog file already exists with content:

1. Parse existing Highlights for PR numbers (extract from `PR#NNNN` links)
2. Compare fetched PRs against the existing set
3. Skip duplicate Highlight entries for PRs already present
4. Re-audit existing entries for linked source PRs, issues, and missing attribution
5. Append new entries to the appropriate sections without duplicating existing ones

### Categorization Signals

* **Labels** (`Project:*`, `Type:*`) are primary
* **Titles** supplement labels
* For **major/minor**, classify each PR into one of:
    * **Features** — new APIs, new packages, new capabilities
    * **Improvements** — enhancements, optimizations, DX upgrades to existing behavior
    * **Fixes** — bug fixes, correctness patches

### Inclusion & Exclusion Rules

The coordinated Agent Skills release section is the only companion-artifact exception
to the PR-based inclusion rules below. Its live tag and remote test evidence determine
eligibility; it is not discovered from the Meteor source diff.

**Include only PRs that touch release-relevant directories:**

* `tools/` — CLI and build system
* `packages/` — core Meteor packages
* `npm-packages/` — published `@meteorjs/*` packages
* `scripts/` — dev bundle build scripts (e.g., Node.js version bumps)

A PR that touches files **only** outside these directories is not a release change and must be excluded from the changelog.

**Exclude PRs that are:**

* Release tooling only (e.g., changelog generation, version bumps)
* Docs-only — touching only `docs/`, `v3-docs/`, `guide/`, or markdown files outside release directories
* CI/test-infrastructure-only — touching only `.github/workflows/`, test harness setup, or E2E infrastructure without changing runtime behavior
* Dependabot PRs unless they bump a dependency that ships in the Meteor release (e.g., Node.js upgrade)
* Internal refactors with no user-facing impact (e.g., renaming internal variables, reformatting)

**When a PR touches both release and non-release directories**, include it — the release-relevant changes take priority for categorization.

### Breaking Change Detection

Scan PR title, body, labels, and phrases such as:

* "breaking", "removed", "renamed", "is now async"

### Assembly Order

1. Version header
2. Highlights
   - **Major/minor**: Features → Improvements → Fixes (as H4 subheaders)
   - **Patch**: flat list, most impactful first
3. All merged PRs link (if needed)
4. External package changelogs (if applicable)
5. Meteor Agent Skills (only for a newly published, exact verified companion catalog tag)
6. Breaking Changes
7. Internal API changes
8. Migration Steps
9. Bumped Meteor Packages (`TBD` if unknown)
10. Bumped NPM Packages (`TBD` or `N/A`)
11. Special thanks to

---

## Writing Rules

**Do**

* Use imperative voice
* Be specific
* Mention user-facing impact
* Merge related PRs

**Don’t**

* Use past tense
* Expose internal-only details
* List trivial PRs individually

---

## Review Checklist

* Correct filename
* Correct version header
* All sections present and ordered
* Empty sections use `N/A`
* Proper bullet and link formats
* No YAML frontmatter
* PR links point to `meteor/meteor`
* Release diff, base-branch PRs, and all milestone items reconciled
* Recursively linked source PRs and issues traced
* Scope discrepancy table and attribution ledger reviewed by the user
* Every direct issue reporter and substantive reproduction or diagnosis contributor credited
* Open milestone items explicitly included or deferred
* Bots and administrative-only participants excluded
* Highlights stay concise and link issues or source PRs only when useful to readers
* Meteor Agent Skills section is omitted unless a new companion catalog tag was
  published and paired with this Meteor release
* Agent Skills companion and official guide links, when the section is present, resolve
  to the exact verified GitHub release and official documentation
* Official releases point to the stable Agent Skills tag rather than a prerelease tag
