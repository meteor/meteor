---
name: changelog
description: Use for writing, reviewing, editing, or generating Meteor release changelog entries. Defines canonical file locations, naming rules, required section structure, formatting conventions, PR-based generation workflow (with gh CLI and web fallback), incremental updates, and common entry patterns. Applies to files under v3-docs/docs/generators/changelog/versions/.
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
* Use `N/A` if none

---

## Linking Conventions

* PR: `[PR#123](https://github.com/meteor/meteor/pull/123)`
* Docs: `[text](https://docs.meteor.com/...)`
* External changelog: `[pkg@ver](url)`
* All PRs: `[GitHub PRs X.Y](...)`

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

### Incremental Updates

When the changelog file already exists with content:

1. Parse existing Highlights for PR numbers (extract from `PR#NNNN` links)
2. Compare fetched PRs against the existing set
3. **Skip PRs already present** — only process newly detected PRs
4. Append new entries to the appropriate sections without duplicating existing ones

### Categorization Signals

* **Labels** (`Project:*`, `Type:*`) are primary
* **Titles** supplement labels
* For **major/minor**, classify each PR into one of:
    * **Features** — new APIs, new packages, new capabilities
    * **Improvements** — enhancements, optimizations, DX upgrades to existing behavior
    * **Fixes** — bug fixes, correctness patches

### Inclusion & Exclusion Rules

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
4. Breaking Changes
5. Internal API changes
6. Migration Steps
7. Bumped Meteor Packages (`TBD` if unknown)
8. Bumped NPM Packages (`TBD` or `N/A`)
9. Special thanks to

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
