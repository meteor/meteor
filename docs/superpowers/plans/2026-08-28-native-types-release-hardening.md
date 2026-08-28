# Native types release hardening implementation plan

> **For Codex:** Execute this plan task by task. For each behavior change, add
> the failing test first, confirm the expected failure, implement the smallest
> fix, and rerun the focused test before continuing.

**Goal:** Make native declaration publishing deterministic, enforce the type
breadth policy in CI, remove declarations from browser assets, and close the
remaining compatibility and failure-semantics test gaps.

**Architecture:** Separate declaration compilation from the reusable
validation/rewrite step. The initial publish compiles once and explicitly
archives `.types-build` declarations; `publish-for-arch` validates and reuses
those files. Keep breadth classification importable and testable, and preserve
the existing best-effort app-build versus strict `meteor types` contract.

**Tech stack:** Meteor tool CommonJS/ES modules, Isobuild self-tests, Jest 30,
Node's built-in test runner, GitHub Actions YAML.

---

### Task 1: Reuse prebuilt declarations in `publish-for-arch`

**Files:**

- Create: `tools/packaging/typescript-declarations.js`
- Create: `tools/packaging/typescript-declarations.test.js`
- Modify: `tools/cli/commands-packages.js`

**Steps:**

1. Add unit tests for mapping `.ts`/`.tsx` entry and subpath sources to
   `.types-build/**/*.d.ts`, normalizing `./`, committing the rewrite only after
   every expected file exists, and reporting missing entry/module outputs.
2. Run the focused Jest file and confirm it fails because the helper does not
   exist.
3. Extract the mapping, validation, and `PackageSource` mutation from
   `generateTypeScriptDeclarations` into the new helper. Return structured
   missing-output details rather than printing from the helper.
4. Keep `generateTypeScriptDeclarations` responsible for running `tsc`, then
   call the helper and preserve the current user-facing diagnostic.
5. Replace the `publish-for-arch` `tsc` call with validation/rewrite of the
   archived `.types-build`; produce a clear fatal diagnostic when files are
   absent and force the package rebuild after a successful rewrite.
6. Rerun the focused unit test and the existing publish TypeScript self-test.
7. Commit the behavior as `fix: reuse published declarations for arch builds`.

### Task 2: Guarantee declarations are present in source archives

**Files:**

- Create: `tools/packaging/package-source-bundle.js`
- Create: `tools/packaging/package-source-bundle.test.js`
- Modify: `tools/packaging/package-client.js`
- Modify: `tools/tests/publish-types.js`

**Steps:**

1. Add tests for recursively collecting only `.d.ts` and `.d.ts.map` files
   below an isopack `typesDir`, deduplicating them with ordinary source files,
   rejecting output outside the package root, and failing on an empty
   declaration directory.
2. Confirm the focused test fails before implementation.
3. Implement a small source-list helper and call it from `publishPackage` before
   `bundleSource`. Do not archive `.tsbuildinfo` or unrelated generated files.
4. Extend the publish self-test with a real copy/tar/extract roundtrip using the
   production source-list and declaration-rewrite helpers. Remove original
   TypeScript configuration/source-only inputs from the extracted fixture and
   verify entry/module declaration bytes and metadata remain unchanged.
5. Add negative roundtrip cases for missing entry and missing module
   declarations; neither may invoke a compiler fallback.
6. Run both focused unit files and `./meteor self-test "publish TypeScript"`.
7. Commit as `fix: include prebuilt declarations in package sources`.

### Task 3: Make the type breadth gate blocking and testable

**Files:**

- Modify: `scripts/type-coverage/check-type-breadth.js`
- Create: `scripts/type-coverage/__tests__/check-type-breadth.node-test.js`
- Modify: `package.json`
- Modify: `.github/workflows/type-coverage.yml`

**Steps:**

1. Add temporary-tree tests for a fully typed manifest, a missing declaration,
   an unclassified package, a waiver, nested package discovery, and submodule
   exclusion.
2. Run the Node test file and confirm it fails because the checker is not
   importable/configurable.
3. Refactor discovery, classification, formatting, and strict exit selection
   into exported functions while retaining the current CLI defaults and text.
4. Add `types:breadth` with `--strict` and `types:breadth:test` scripts.
5. Add focused-test and strict breadth steps to the Type Coverage workflow.
6. Run `npm run types:breadth:test` and `npm run types:breadth`.
7. Commit as `ci: enforce package type breadth`.

### Task 4: Keep `jquery.d.ts` out of client assets

**Files:**

- Modify: `packages/non-core/jquery/package.js`
- Modify: `tools/tests/typescript.js`

**Steps:**

1. Extend `core package declarations are not client assets` to install/use the
   jQuery package, require a generated `meteor/jquery` declaration, and reject
   `.d.ts` entries in the browser program.
2. Run the focused self-test and confirm the current `api.addAssets` behavior
   makes the assertion fail.
3. Replace the client asset registration with `api.types('jquery.d.ts')`.
4. Rerun the focused self-test and confirm both declaration generation and
   browser bundle assertions pass.
5. Commit as `fix: register jquery declarations as types`.

### Task 5: Cover transitive compatibility and command failure semantics

**Files:**

- Modify: `tools/tests/typescript.js`

**Steps:**

1. Add a local package fixture that depends on `zodern:types`, add only the
   parent package to the app, prove `zodern:types` is not a direct constraint,
   run `meteor types`, and assert native declarations are generated.
2. Add a deterministic obstruction at `.meteor/types` and assert an ordinary
   `meteor build --directory` reports the generation warning but exits zero.
3. Reuse the obstruction with `meteor types` and assert a non-zero exit and the
   underlying error message.
4. Run the new focused self-tests and adjust only product behavior if the tests
   reveal a contract mismatch; otherwise retain the current implementation.
5. Commit as `test: cover native types compatibility failures`.

### Task 6: Remove an obsolete global compatibility symlink

**Files:**

- Modify: `tools/isobuild/types-generator.test.js`
- Modify: `tools/isobuild/types-generator.js`

**Steps:**

1. Add a unit test starting with an existing
   `.meteor/types/node_modules/meteor-package-types` link and a package set that
   uses only single-file declarations. Assert the exact stale link is removed
   while current declaration output is retained.
2. Run the focused Jest test and confirm it fails.
3. Add a narrowly scoped removal helper and invoke it when
   `needsPackageTypesLink` is false. Preserve the current create/repair path
   when the link is needed.
4. Rerun all `types-generator.test.js` cases.
5. Commit as `fix: remove stale package types symlink`.

### Task 7: Consolidated verification and review

**Files:**

- Modify: `PR-14685-14698-CODE-REVIEW.md` outside the worktree only if its
  findings/status need reconciliation after implementation.

**Steps:**

1. Run `git diff --check` and inspect the complete base-to-head diff.
2. Run focused Jest tests for declaration publishing and the generator.
3. Run `npm run types:breadth:test` and `npm run types:breadth`.
4. Run the focused TypeScript and publish self-tests with retries disabled.
5. Run `npm run types:compile`, `npm run types:test`,
   `npm run types:coverage`, and `npm run types:dts-test-coverage`.
6. Validate `.github/workflows/type-coverage.yml` with the repository's
   available YAML/workflow checker.
7. Review for breaking changes: legacy packages, direct and transitive
   `zodern:types`, source bundles created before this feature, Windows paths,
   and browser asset composition.
8. Update the review report with exact commands/results, then present any
   remaining risk without claiming unrun checks passed.
