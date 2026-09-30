---
name: docs-gap
description: Use when analyzing release branch changes for missing user-facing documentation. Compares the release branch against devel, filters for user-facing changes, scans v3-docs/docs/ for coverage, and produces a gap report (.md file) with prioritized documentation opportunities. Does NOT write documentation — only identifies gaps and outputs a plan for later action.
---

# Documentation Gap Analysis

Analyze release changes and identify missing user-facing documentation. Produces a gap report as a `.md` file for later action — does **not** write the documentation itself.

---

## Branching Model

Releases are prepared on **`release-<VERSION>`** branches. The main development branch is **`devel`**.

- **Change scope** = all changes on `release-<VERSION>` that are not on `devel`
- Always compare against `devel` to determine what is new in the release
- Use `git log devel..HEAD` when on the release branch

This is the same branching model used by the [changelog](../changelog/SKILL.md) and [version-bump](../version-bump/SKILL.md) skills.

---

## Step 1: Gather Release Changes

Fetch merged PRs targeting the release branch:

**Primary — `gh` CLI:**

```bash
gh pr list --repo meteor/meteor \
  --base release-<VERSION> \
  --state merged \
  --limit 200 \
  --json number,title,labels,author,body,url
```

**Fallback — git log:**

```bash
git log --oneline devel..HEAD --merges | grep -oP '#\K[0-9]+'
```

Then fetch details per PR with `gh pr view`.

---

## Step 2: Filter to Release-Relevant Changes

Apply the same inclusion rules as the changelog skill.

**Include only PRs that touch:**

* `tools/` — CLI and build system
* `packages/` — core Meteor packages
* `npm-packages/` — published `@meteorjs/*` packages
* `scripts/` — dev bundle build scripts

**Exclude PRs that are:**

* Docs-only (touching only `docs/`, `v3-docs/`, `guide/`)
* CI/test-infrastructure-only (`.github/workflows/`, E2E harness)
* Release tooling only (version bumps, changelog generation)
* Dependabot PRs unless they bump a user-visible dependency
* Internal refactors with no user-facing impact

---

## Step 3: Classify Changes for Documentation Potential

Not all release changes need documentation. Classify each included PR:

### High Priority (likely needs docs)

| Change Type | Signal | Expected Doc Section |
|-------------|--------|---------------------|
| New package | New `packages/*/package.js` created | `packages/` — new article |
| New CLI command or option | Changes to `tools/cli/commands.js` adding new commands/flags | `cli/` — update or new section |
| New skeleton or template | New entries in `tools/static-assets/` | `about/` — getting started update |
| New integration or bundler feature | Changes to `packages/rspack/`, `packages/tools-core/`, `npm-packages/meteor-rspack/` | `about/modern-build-stack/` — update or new article |
| Breaking change | PR title/body mentions "breaking", "removed", "renamed" | Relevant section + migration note |

### Medium Priority (may need docs)

| Change Type | Signal | Expected Doc Section |
|-------------|--------|---------------------|
| New feature in existing package | New exports, new methods, new options | `packages/` — update existing article |
| Behavior change | Changed defaults, new error messages | `packages/` or `troubleshooting/` |
| Performance improvement (user-actionable) | New config option or recommended pattern | `performance/` |

### Low Priority (usually no docs needed)

| Change Type | Signal | Expected Doc Section |
|-------------|--------|---------------------|
| Bug fix | Fix to existing behavior, no API change | Usually none — unless the bug was a known issue in `troubleshooting/` |
| Internal optimization | No user-visible change | None |
| Type definition fix | `.d.ts` changes only | None |

**Skip low-priority items** in the gap report unless they fix a documented known issue.

---

## Step 4: Scan Existing Documentation for Coverage

For each high and medium priority change, search `v3-docs/docs/` for existing coverage.

### Search Strategy

For each PR, extract keywords from:
- PR title (e.g., "Rspack CSS delegation", "TypeScript Tailwind skeleton")
- Package name (e.g., `accounts-base`, `rspack`)
- Feature name (e.g., `swc.config.ts`, `getUserIdsInRoleAsync`)

Then search:

```bash
# Search by feature keyword
grep -rl "<keyword>" v3-docs/docs/ --include="*.md"

# Search by package name
grep -rl "<package-name>" v3-docs/docs/ --include="*.md"
```

### Documentation Scope (In-Scope Sections)

Only scan and report on **user-facing** documentation sections:

| Section | Path | What It Covers |
|---------|------|---------------|
| About / Quick Start | `v3-docs/docs/about/` | Getting started, install, concepts, modern build stack |
| Packages | `v3-docs/docs/packages/` | Official package guides |
| CLI | `v3-docs/docs/cli/` | Command-line reference |
| Tutorials | `v3-docs/docs/tutorials/` | Step-by-step framework guides |
| Troubleshooting | `v3-docs/docs/troubleshooting/` | Common issues and solutions |
| Performance | `v3-docs/docs/performance/` | Optimization guides |
| Community Packages | `v3-docs/docs/community-packages/` | Third-party package docs |

### Out-of-Scope Sections (Do NOT Report Gaps For)

| Section | Path | Why Excluded |
|---------|------|-------------|
| API Reference | `v3-docs/docs/api/` | Auto-generated from JSDoc — separate concern |
| Generators | `v3-docs/docs/generators/` | Build tooling for the doc site |
| JSDoc | `v3-docs/docs/jsdoc/` | JSDoc configuration |
| Components | `v3-docs/docs/components/` | Vue components for doc site |
| Data / Search / Public | `v3-docs/docs/data/`, `search/`, `public/` | Site infrastructure |

### Coverage Assessment

For each change, classify as:

- **Documented** — existing docs cover the feature adequately (file path + relevant section)
- **Partially documented** — feature is mentioned but not fully explained (file path + what's missing)
- **Not documented** — no docs found for this change

---

## Step 5: Produce the Gap Report

Output a `.md` file at `docs/plans/<DATE>-docs-gap-<VERSION>.md` with this structure:

````markdown
# Documentation Gap Report: v<VERSION>

**Generated:** <DATE>
**Branch:** release-<VERSION> vs devel
**PRs analyzed:** <COUNT>
**Gaps found:** <COUNT>

---

## Already Documented

Changes that have adequate documentation coverage.

| PR | Change | Doc File | Notes |
|----|--------|----------|-------|
| [PR#NNN](url) | Description | `v3-docs/docs/path/file.md` | Covered in section X |

---

## Partially Documented

Changes mentioned in docs but needing updates.

| PR | Change | Doc File | What's Missing |
|----|--------|----------|---------------|
| [PR#NNN](url) | Description | `v3-docs/docs/path/file.md` | Missing: new option X, updated example |

---

## Not Documented

Changes with no corresponding documentation.

### High Priority

| PR | Change | Suggested Action |
|----|--------|-----------------|
| [PR#NNN](url) | Description | Create `v3-docs/docs/section/file.md` — describe X for end users |

### Medium Priority

| PR | Change | Suggested Action |
|----|--------|-----------------|
| [PR#NNN](url) | Description | Update `v3-docs/docs/section/file.md` — add section about Y |

---

## Summary

- **Total user-facing changes:** N
- **Documented:** N
- **Partially documented:** N
- **Not documented:** N (high: N, medium: N)
````

---

## Prioritization

Rank gaps in this order:

1. **New features / new packages** — users cannot discover these without docs
2. **Breaking changes** — users need migration guidance
3. **New CLI commands/options** — users need to know they exist
4. **New integrations / build features** — expanding ecosystem
5. **Behavior changes** — users may be surprised
6. **Performance improvements** — only if user-actionable (e.g., new config)

Bug fixes and internal optimizations generally do not need documentation.

---

## Writing Guidelines for Suggested Actions

When describing what documentation to write in the gap report, keep suggestions **user-friendly**:

**Do:**
- Frame from the user's perspective ("How to use X", "Getting started with Y")
- Suggest practical examples and code snippets
- Reference existing doc patterns in the same section
- Suggest updating existing articles before creating new ones

**Don't:**
- Suggest documenting internal implementation details
- Suggest documenting private APIs or internal methods
- Frame documentation as technical specs
- Suggest documentation for changes only relevant to Meteor contributors

### Preserving Style and Integration

When the gap report is used to write documentation, the new content must feel native to the existing docs — not bolted on. Each suggested action in the report should include guidance on how to integrate cleanly:

- **Read the target file first.** Before suggesting where to add content, note the writing style, heading levels, use of components (e.g., `<ApiBox>`), code example format, and tone.
- **Match the surrounding pattern.** If nearby sections use a brief intro paragraph followed by a code block and a tip, follow the same structure. If they use bullet lists, use bullet lists.
- **Find the right spot.** Place new content next to related existing content — not appended at the end. For example, a new API method goes next to similar methods; a new framework section goes alongside the other framework sections.
- **Use the same components.** If the doc uses `<ApiBox>`, `:::warning`, `:::info`, code groups, or other VitePress/Vue components, use them for new content too.
- **Preserve categorization.** New package docs go in `packages/`, new CLI options go in `cli/`, new getting-started content goes in `about/`. Do not create new top-level sections unless no existing section fits.

---

## Review Checklist

Before finalizing the gap report:

- [ ] All high and medium priority PRs have been assessed
- [ ] Each "Not Documented" item has a concrete suggested action (file path + description)
- [ ] "Partially Documented" items specify what exactly is missing
- [ ] No low-priority items (pure bug fixes, internal refactors) are included unless they fix a documented known issue
- [ ] All doc file paths in "Already Documented" are verified to exist
- [ ] Suggested new articles align with the existing doc structure and naming conventions
- [ ] Gap report is saved to `docs/plans/<DATE>-docs-gap-<VERSION>.md`
