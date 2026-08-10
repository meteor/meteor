---
name: sync-modern-tool-versions
description: Use when changing npm package or dependency versions used by Meteor's modern tooling, especially Rspack and SWC. Discovers and synchronizes manifests, lockfiles, install constants, compatibility floors, skeletons, E2E fixtures, and active documentation. Verifies repository consistency but never publishes packages or releases.
---

# Sync Modern Tool Versions

Synchronize modern-tool version references and report whether the repository is
consistent. Never run `npm publish`, `meteor publish`, push tags, or make any
other external release change.

## Sources and Related Skills

- Treat the [Rspack developer guide maintenance section](../../../dev/modern-tools/rspack/README.md#common-maintenance-tasks)
  as the authoritative maintenance and publishing reference. This skill does
  not execute its publishing steps.
- Use [version-bump](../version-bump/SKILL.md) for Atmosphere package and Meteor
  release versions.
- Use [changelog](../changelog/SKILL.md) for the current release record.
- Use [modern-tools](../modern-tools/SKILL.md) for integration architecture.

If the guide and repository behavior disagree, inspect the implementation,
then update both the guide and this skill in the same change.

## Workflow

### 1. Identify changed versions

Determine the comparison range and list each changed package or dependency with
its old version, new version, and intended semantics.

```bash
git show --stat <commit>
git diff <base>..<head> -- '**/package.json' '**/package-lock.json' \
  'packages/**/constants.js' 'packages/**/package.js'
```

Do not assume `@meteorjs/rspack`, `@rspack/core`, `@rspack/cli`, and the
`rspack` Atmosphere package share a version scheme.

### 2. Find active references

Search for the dependency name, old version, constant, and version consumer.

```bash
rg -n --fixed-strings '<dependency-name>' .
rg -n --fixed-strings '<old-version>' .
rg -n '<CONSTANT_NAME>|semverCondition|peerDependencies' \
  packages npm-packages tools dev v3-docs
```

Inspect manifests, lockfiles, constants, `dependencies.js`, skeletons, E2E
fixtures, scripts, current changelogs, and active documentation. Treat old
changelogs as historical records unless correcting the release being prepared.
Use commit `377e69e14d7e1480bc4de36e60d3a1a347475421` only as an example, then
search the current tree for newer consumers.

### 3. Synchronize by meaning

| Version kind | Rule |
|--------------|------|
| Published package identity | Keep `package.json` and lockfile root version and metadata identical |
| Recommended or auto-install version | Move to the intended supported default |
| `gte` or peer floor | Raise only when code requires a newer minimum API |
| Normal skeleton or fixture | Follow the recommended version and existing range style |
| Compatibility fixture | Preserve an older supported version and report why |
| Atmosphere package version | Keep independent and handle with `version-bump` |

For `semverCondition: 'gte'`, the constant is both the minimum accepted version
and the version installed when absent. Confirm the runtime works at that floor.

Apply the required manifest, lockfile, constant, template, fixture, and active
documentation edits. Regenerate lockfiles with their owning package manager and
review unrelated churn. Repeat the searches afterward and classify every old
version that remains.

## Rspack Invariants

- Keep `npm-packages/meteor-rspack/package.json`, its lockfile root, and
  `DEFAULT_METEOR_RSPACK_VERSION` on the same exact version.
- Normally use `^<DEFAULT_METEOR_RSPACK_VERSION>` in skeletons and E2E fixtures
  that are not compatibility tests.
- Keep `DEFAULT_RSPACK_VERSION` as the recommended floor for both
  `@rspack/core` and `@rspack/cli`.
- Keep npm `>=` peer floors at or below the recommended version. Do not raise a
  peer floor only to make numbers equal.
- Keep `packages/rspack/package.js` independent. Include it in normal release
  bump analysis when shipped runtime code or constants change.

Treat the version-constant mapping as exhaustive:

| Constant | Dependency or dependencies |
|----------|----------------------------|
| `DEFAULT_RSPACK_VERSION` | `@rspack/core`, `@rspack/cli` |
| `DEFAULT_METEOR_RSPACK_VERSION` | `@meteorjs/rspack` |
| `DEFAULT_METEOR_RSPACK_REACT_HMR_VERSION` | `@rspack/plugin-react-refresh` |
| `DEFAULT_METEOR_RSPACK_REACT_REFRESH_VERSION` | `react-refresh` |
| `DEFAULT_METEOR_RSPACK_SWC_LOADER_VERSION` | `swc-loader` |
| `DEFAULT_METEOR_RSPACK_SWC_HELPERS_VERSION` | `@swc/helpers` |
| `DEFAULT_RSDOCTOR_RSPACK_PLUGIN_VERSION` | `@rsdoctor/rspack-plugin` |

Require every exported `DEFAULT_*_VERSION` in
`packages/rspack/lib/constants.js` to have a mapping and every mapped constant
to exist. Update this table and the audit together when constants change. Flag
constants with no consumer in `packages/rspack/lib/dependencies.js`.

## Verify

Run the Rspack audit whenever a mapped version is involved:

```bash
node .github/skills/sync-modern-tool-versions/scripts/audit-rspack-versions.mjs
```

Resolve every audit failure. Review reported compatibility references and
unused constants rather than changing them blindly. Then run `git diff --check`
and tests proportional to the changed integration. Report synchronized files,
preserved compatibility pins, audit results, and any Atmosphere release bump
left for `version-bump`.
