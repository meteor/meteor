---
name: version-bump
description: Use when bumping Meteor package versions for beta, RC, or official releases. Covers the two version schemes (meteor-tool vs all other packages), the update-semver automation tool, manual files the tool does not handle, and the full lifecycle from beta through official release. Applies to packages/*/package.js, scripts/admin/, npm-packages/meteor-installer/, and .meteor/versions in test apps.
---

# Meteor Version Bump Rules

Guidelines for bumping package versions across the Meteor repository for beta, RC, and official releases.

---

## Branching Model

Releases are prepared on **`release-<VERSION>`** branches (e.g., `release-3.4.1`). The main development branch is **`devel`**.

- **Changed packages** = packages with diffs between `devel` and the release branch
- Always compare against `devel` to determine which packages need version bumps
- The release branch name determines the **track number** used in prerelease suffixes

### Track Number Derivation

The track number is the release branch digits concatenated (dots removed):

| Branch | Track Number |
|--------|-------------|
| `release-3.4` | `340` |
| `release-3.4.1` | `341` |
| `release-3.5` | `350` |

### Detecting Changed Packages

```bash
git diff devel --dirstat=files -- ./packages/
```

This is the same comparison used by the `update-semver` automation tool via `scripts/admin/update-semver/get-diff.sh`.

---

## Prerequisites

Before bumping versions:

1. You must be on a `release-*` branch
2. All changes intended for the release must be merged
3. Confirm the release type with the user: **beta**, **RC**, or **official**

---

## Version Format Reference

### Two Distinct Schemes

**1. `meteor-tool`** — simple semver prerelease (no track number):

| Stage | Format | Example |
|-------|--------|---------|
| Beta | `X.Y.Z-beta.N` | `3.4.0-beta.0` |
| RC | `X.Y.Z-rc.N` | `3.4.0-rc.0` |
| Official | `X.Y.Z` | `3.4.0` |

**2. All other packages** — encode the track number in the prerelease tag:

| Stage | Format | Example (track `340`) |
|-------|--------|-----------------------|
| Beta | `X.Y.Z-beta<TRACK>.N` | `3.2.0-beta340.0` |
| RC | `X.Y.Z-rc<TRACK>.N` | `3.2.0-rc340.0` |
| Official | `X.Y.Z` | `3.2.0` |

### Version Transitions

| Transition | meteor-tool | Other packages |
|------------|------------|----------------|
| Stable to first beta | `3.3.1` -> `3.4.0-beta.0` | `3.1.2` -> `3.2.0-beta340.0` |
| Beta to next beta | `3.4.0-beta.0` -> `3.4.0-beta.1` | `3.2.0-beta340.0` -> `3.2.0-beta340.1` |
| Beta to first RC | `3.4.0-beta.14` -> `3.4.0-rc.0` | `3.2.0-beta340.14` -> `3.2.0-rc340.0` |
| RC to next RC | `3.4.0-rc.0` -> `3.4.0-rc.1` | `3.2.0-rc340.0` -> `3.2.0-rc340.1` |
| RC to official | `3.4.0-rc.4` -> `3.4.0` | `3.2.0-rc340.4` -> `3.2.0` |

---

## Version Bump Magnitude

When creating the **first beta** for a release, each changed package needs a version bump from its current stable version. The magnitude depends on the nature of changes.

For subsequent betas, RCs, and official releases, the base version (`X.Y.Z`) stays the same — only the prerelease suffix changes.

### Magnitude Rules

| Magnitude | When to use | Examples |
|-----------|------------|---------|
| **Patch** | Bug fixes, performance improvements, type fixes, internal refactors with no API changes | Fix passwordValidator precedence, remove redundant await, TypeScript type corrections |
| **Minor** | New public APIs, new exported functions/methods, new user-facing features or capabilities | New `getUserIdsInRoleAsync` method, new CSS auto-delegation feature, new test assertion methods |
| **Major** | Breaking changes, removed APIs, renamed exports, changed function signatures | Removed public method, renamed package export, async migration of sync API |

### How to Assess Each Package

For each changed package, Claude should analyze the diff to determine the bump magnitude:

```bash
git diff devel -- packages/<name>/
```

**IMPORTANT — Auto-update safety rule:** Meteor patch versions are picked up automatically by apps using `~` semver ranges. A patch bump that changes observable behavior can silently break apps on their next update. **When in doubt, bump minor** — it's always safer. Minor bumps require explicit opt-in, giving users control over when they adopt changes.

**Check for minor bump signals:**
- New functions or methods exported in `package.js` (`api.export`, `api.addFiles` for new files)
- New public methods added to existing classes (e.g., new assertion methods, new query helpers)
- New configuration options or capabilities that users can opt into
- Significant new features even without new exports (e.g., new bundler capabilities)
- **Removed internal methods/functions** — even `_`-prefixed methods, since Meteor users commonly monkey-patch internals
- **Changed which implementation runs** — e.g., switching from a polyfill to native, or replacing a dependency, even if the API is the same
- **Behavioral changes in existing code paths** — changed defaults, different error handling, altered timing/ordering, even if "correct"
- **Changed HTML templates or UI content** — packages that deliver HTML via `addFiles` (e.g., `*-config-ui` packages with OAuth setup instructions) produce different user-visible output when their templates change

**Check for patch bump signals:**
- Changes only to existing function bodies that **fix clearly incorrect behavior** (null checks, crash fixes, typo corrections)
- TypeScript type corrections (additive `.d.ts` changes only)
- Removed truly redundant code with **provably identical behavior** (e.g., `return await` → `return` in async function)
- Test-only changes alongside minor runtime fixes
- Documentation or JSDoc updates

**Check for major bump signals:**
- Removed or renamed exports in `package.js`
- Changed function signatures (new required parameters, changed return types)
- Removed public methods from classes
- Behavior changes that could break existing user code

### Presenting the Decision

When proposing version bumps to the user, always present a table with the **reason** for each bump decision:

```markdown
| Package | Current | Bump | New Version | Reason |
|---------|---------|------|-------------|--------|
| roles | 1.0.2 | minor | 1.1.0-betaXXX.0 | **New public API:** `getUserIdsInRoleAsync` added |
| webapp | 2.1.1 | patch | 2.1.2-betaXXX.0 | Removed Vary header — bug fix, no new APIs |
| google-config-ui | 1.0.4 | minor | 1.1.0-betaXXX.0 | **UI content change:** OAuth setup instructions updated — user-facing HTML differs |
| ddp-client | 3.1.1 | minor | 3.2.0-betaXXX.0 | **Removed internal method:** `_processOneDataMessage` — could break monkey-patching |
```

Always get user confirmation before applying the bumps.

### Build Plugin Cascading Rule

When a package in the **build plugin chain** is bumped, its dependent build plugins must also be bumped — even if they have no code changes. This is because build plugins compile user code, and a change in an upstream compiler dependency can affect the compiled output.

**The build plugin chain:**

```
babel-compiler
├── ecmascript      (registerBuildPlugin, uses babel-compiler)
├── typescript       (registerBuildPlugin, uses babel-compiler)
└── minifier-js      (registerBuildPlugin, uses babel-compiler)
```

**Rule:** If `babel-compiler` is in the bump list, also bump `ecmascript`, `typescript`, and `minifier-js`. Cascade bumps must match or exceed the upstream magnitude — if `babel-compiler` gets a minor bump, cascading packages also get minor (unless their own changes warrant major).

This rule applies only to build plugin dependencies (`registerBuildPlugin` + `api.use` of the upstream package). It does **not** apply to:
- Umbrella/wrapper packages that `api.imply` a bumped package (e.g., `ddp` implying `ddp-server`)
- The `accounts-*` family that implies `accounts-base`
- Packages that only use a bumped package at runtime via `api.use`

When presenting the bump table, mark cascading bumps clearly:

```markdown
| Package | Current | Bump | New Version | Reason |
|---------|---------|------|-------------|--------|
| babel-compiler | 7.13.0 | patch | 7.13.1-betaXXX.0 | Bug fix in compilation |
| typescript | 5.9.3 | patch | 5.9.4-betaXXX.0 | **Cascade:** depends on babel-compiler (build plugin) |
| ecmascript | 0.17.0 | patch | 0.17.1-betaXXX.0 | **Cascade:** depends on babel-compiler (build plugin) |
| minifier-js | 3.1.0 | patch | 3.1.1-betaXXX.0 | **Cascade:** depends on babel-compiler (build plugin) |
```

---

## Files Touched Per Release Type

| File | Beta | RC | Official |
|------|------|----|----------|
| `packages/*/package.js` | Yes | Yes | Yes |
| `scripts/admin/meteor-release-experimental.json` | Yes | Yes | No |
| `scripts/admin/meteor-release-official.json` | No | No | Yes |
| `.meteor/versions` in `test-apps/` only | Yes | Yes | Yes |
| `npm-packages/meteor-installer/config.js` | No | No | Yes |
| `npm-packages/meteor-installer/package.json` + lock | No | No | Yes |
| `v3-docs/` (changelog, docs with version refs) | Yes | Yes | Yes |

---

## Preferred Approach: AI-Driven Analysis

Claude should perform the version bump process directly rather than relying on the `update-semver` script. The AI approach is preferred because:

1. **Magnitude decisions require context** — the script defaults everything to patch, missing minor/major bumps for new APIs or breaking changes
2. **Branch name dependency** — the script requires being on a `release-*` branch and will fail on preparation branches
3. **Incomplete coverage** — the script only handles `packages/*/package.js`, not release files, `.meteor/versions`, npm installer, or docs
4. **Transparency** — AI analysis shows reasoning for each bump decision, making review easier

### AI Workflow

1. Detect changed packages: `git diff devel --dirstat=files -- ./packages/`
2. For each package, read the diff and current version from `package.js`
3. Classify the bump magnitude (patch/minor/major) based on change analysis
4. Present the full table with reasons to the user for confirmation
5. Apply all `package.js` version edits
6. Handle the manual files (release JSON, `.meteor/versions`, etc.)

### Deriving the Version

Given a current stable version and the release branch track number:

- **Patch bump beta:** `X.Y.Z` → `X.Y.(Z+1)-beta<TRACK>.0`
- **Minor bump beta:** `X.Y.Z` → `X.(Y+1).0-beta<TRACK>.0`
- **Major bump beta:** `X.Y.Z` → `(X+1).0.0-beta<TRACK>.0`
- **meteor-tool:** same logic but suffix is `-beta.0` (no track number)

---

## Fallback: `update-semver` Script

Located at `scripts/admin/update-semver/`. Use only when on a `release-*` branch and a quick default-patch bump is acceptable.

**Limitations:**
- Requires `release-*` branch name (fails on other branches)
- Defaults all packages to patch (no magnitude analysis)
- Only updates `packages/*/package.js` — does not touch release files, `.meteor/versions`, npm installer, or docs

### Usage

```bash
cd scripts/admin/update-semver

# Auto-bump all changed packages for beta (all patch)
npm run bump-experimental-beta

# Auto-bump all changed packages for RC
npm run bump-experimental-rc

# Bump specific packages with specific magnitudes
node index.js accounts-password.minor babel-compiler.minor
```

---

## Release Type: Beta

### Step 1: Analyze and bump package versions

1. Detect changed packages: `git diff devel --dirstat=files -- ./packages/`
2. For each changed package, analyze the diff to determine patch/minor/major
3. Present the bump table with reasons to the user
4. After confirmation, edit each `packages/*/package.js` `Package.describe` version
5. Apply the correct beta suffix: `X.Y.Z-beta<TRACK>.0` for packages, `X.Y.Z-beta.0` for meteor-tool

### Step 2: Update experimental release file

Edit `scripts/admin/meteor-release-experimental.json`:

```json
{
  "track": "METEOR",
  "version": "X.Y-beta.N",
  "recommended": false,
  "official": false,
  "description": "Meteor experimental release"
}
```

- Version format: `X.Y-beta.N` (short form, no patch component)
- Both `recommended` and `official` are `false`

### Step 3: Update `.meteor/versions` in test apps

**Only update test apps under `test-apps/`** (e.g., `test-apps/34app/`). Do **NOT** update `.meteor/versions` in `tools/tests/apps/` or `tools/e2e-tests/apps/` — those are pinned for CI stability.

```bash
find test-apps/ -name "versions" -path "*/.meteor/*"
```

In each file, update only packages that are at prerelease versions (or newly added packages). Leave already-stable package versions untouched.

> **Note:** The set of packages at prerelease versions can grow between beta and RC as more changes are merged to the release branch.

### Step 4: Update documentation and changelog

Use the [changelog skill](../changelog/SKILL.md) to create or update the changelog entry at `v3-docs/docs/generators/changelog/versions/<VERSION>.md`.

Update the version header date to the current date. Update the **Bumped Meteor Packages** section in the changelog with all packages that were bumped. Use the version that matches the current release stage — beta versions for beta releases, RC versions for RC releases, and final versions (no prerelease suffix) for official releases. Format: one package per line, `name@version`. Include `meteor-tool@<version>` when applicable.

Update any documentation files that reference specific package versions (e.g., rspack installation commands).

---

## Release Type: RC (Release Candidate)

### Step 1: Bump package versions

Update the prerelease suffix in each `packages/*/package.js` from beta to RC (or increment RC):

The transitions are:
- `beta<TRACK>.N` -> `rc<TRACK>.0` (first RC)
- `rc<TRACK>.N` -> `rc<TRACK>.N+1` (subsequent RCs)
- `beta.N` -> `rc.0` (meteor-tool, first RC)
- `rc.N` -> `rc.N+1` (meteor-tool, subsequent RCs)

### Step 2: Update experimental release file

Edit `scripts/admin/meteor-release-experimental.json`:

```json
{
  "track": "METEOR",
  "version": "X.Y-rc.N",
  "recommended": false,
  "official": false,
  "description": "Meteor experimental release"
}
```

### Step 3: Update `.meteor/versions` in test apps

Same rule as beta: only `test-apps/`, not `tools/tests/apps/` or `tools/e2e-tests/apps/`. Update only packages at prerelease versions.

### Step 4: Update documentation and changelog

Update the version header date to the current date. Update changelog and any docs referencing RC versions. Update the **Bumped Meteor Packages** section with the current RC versions.

---

## Release Type: Official

Official releases follow a **two-step process** (typically two separate commits).

### Commit 1: Packages and release config

#### Step 1: Strip prerelease suffixes from all packages

For every `packages/*/package.js` that has an RC version, remove the `-rc<TRACK>.N` or `-rc.N` suffix:

- `3.2.0-rc340.4` -> `3.2.0`
- `3.4.0-rc.4` -> `3.4.0` (meteor-tool)

#### Step 2: Update official release file

Edit `scripts/admin/meteor-release-official.json`:

```json
{
  "track": "METEOR",
  "version": "X.Y",
  "recommended": false,
  "official": true,
  "description": "The Official Meteor Distribution"
}
```

- For `.0` releases: short form `X.Y` (e.g., `3.4`)
- For patch releases: `X.Y.Z` (e.g., `3.4.1`)
- `official` must be `true`

#### Step 3: Update `.meteor/versions` in test apps

Only `test-apps/`, not `tools/tests/apps/` or `tools/e2e-tests/apps/`. Strip prerelease suffixes from packages that were at RC versions. Leave stable versions untouched.

#### Step 4: Update changelog and docs

- Set the release date in the changelog
- Replace all RC version references with final versions
- Update the **Bumped Meteor Packages** section with final versions (no prerelease suffixes)
- Update `v3-docs/docs/history.md` with the full release entry

### Commit 2: npm installer

This is a **separate commit** after the packages commit.

#### Step 1: Update installer config

Edit `npm-packages/meteor-installer/config.js`:

```js
const METEOR_LATEST_VERSION = 'X.Y';
```

- For `.0` releases: short form without patch (e.g., `'3.4'`)
- For patch releases: full version (e.g., `'3.4.1'`, `'3.3.2'`)

#### Step 2: Update installer package.json

Edit `npm-packages/meteor-installer/package.json`:

```json
{
  "version": "X.Y.Z"
}
```

Full semver form required by npm (e.g., `"3.4.0"`, `"3.4.1"`).

#### Step 3: Update package-lock.json

Run `npm install` in `npm-packages/meteor-installer/` to regenerate the lock file, or manually update the version field.

---

## Checklist

### Beta Release

- [ ] Detect changed packages (`git diff devel --dirstat=files -- ./packages/`)
- [ ] Analyze each package diff and determine bump magnitude (patch/minor/major)
- [ ] Present bump table with reasons to user and get confirmation
- [ ] Apply version bumps to all `packages/*/package.js`
- [ ] Update `scripts/admin/meteor-release-experimental.json` version to `X.Y.Z-beta.N`
- [ ] Update `.meteor/versions` in `test-apps/` only (not `tools/tests/apps/` or `tools/e2e-tests/apps/`)
- [ ] Update changelog at `v3-docs/docs/generators/changelog/versions/`
- [ ] Update docs referencing package versions

### RC Release

- [ ] Update prerelease suffix from beta to RC (or increment RC) in all `packages/*/package.js`
- [ ] Update `scripts/admin/meteor-release-experimental.json` version to `X.Y.Z-rc.N`
- [ ] Update `.meteor/versions` in `test-apps/` only (not `tools/tests/apps/` or `tools/e2e-tests/apps/`)
- [ ] Update changelog
- [ ] Update docs referencing package versions

### Official Release

- [ ] Strip RC suffixes from all `packages/*/package.js`
- [ ] Update `scripts/admin/meteor-release-official.json` (version `X.Y`, `official: true`)
- [ ] Update `.meteor/versions` in `test-apps/` only (strip prerelease suffixes)
- [ ] Finalize changelog (set date, replace RC versions with final)
- [ ] Update `v3-docs/docs/history.md`
- [ ] **Separate commit:** Update `npm-packages/meteor-installer/config.js` (`'X.Y'`)
- [ ] **Separate commit:** Update `npm-packages/meteor-installer/package.json` (`"X.Y.0"`)
- [ ] **Separate commit:** Update `npm-packages/meteor-installer/package-lock.json`
