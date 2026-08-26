# PR 14685 Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the review findings unrelated to the TypeScript 7/dev-bundle integration and prove the corrected contracts with regressions and local builds.

**Architecture:** Runtime behavior remains unchanged. Public `.d.ts` files are aligned with existing runtime payloads, while `api.types()` validates metadata at declaration time and the type generator uses a dedicated collision-free submodule filename encoder. Package manifests route declarations through `api.types()`, and self-tests exercise the resulting build artifacts.

**Tech Stack:** JavaScript, TypeScript declaration tests with `expect-type`, Jest, Meteor self-test, Isobuild.

**Spec:** `docs/superpowers/specs/2026-08-26-pr-14685-review-findings-design.md`

## Global Constraints

- Do not modify the TypeScript 7/dev-bundle integration, including `scripts/dev-bundle-tool-package.js`, `BUNDLE_VERSION`, `@meteorjs/babel`, or `packages/typescript/package.js`.
- Do not change runtime behavior for DDP, Accounts, or Session.
- Every code fix starts with a focused failing regression and is verified green before the next task.
- Generated submodule filenames must be safe on Windows and distinct for `index`, `a/b`, `a::b`, and `a__b`.

---

### Task 1: DDP Runtime-Compatible Declarations

**Files:**
- Modify: `packages/ddp/ddp.test-d.ts`
- Modify: `packages/ddp/ddp.d.ts`

**Interfaces:**
- Consumes: `Meteor.SubscriptionHandle`, `Meteor.MethodApplyOptions`, `EJSONable`, and `EJSONableProperty`.
- Produces: callback-aware `DDP.DDPStatic.subscribe`, `call`, `apply`, and concretely typed `methods` handlers.

- [ ] **Step 1: Write the failing declaration regressions**

Add calls that pass primitive DDP arguments, subscription callbacks, a call result callback, readonly apply arguments/options, and a concrete `(id: string)` method handler.

- [ ] **Step 2: Verify RED**

Run: `npm run types:compile`

Expected: TypeScript rejects primitives/callbacks and the concrete method handler in `packages/ddp/ddp.test-d.ts`.

- [ ] **Step 3: Implement the minimal declaration fix**

Import `EJSONableProperty`, introduce a reusable serializable argument union and callback interfaces, mirror `Meteor.MethodApplyOptions<Result>`, and use `any[]` only at the method-handler declaration boundary.

- [ ] **Step 4: Verify GREEN**

Run: `npm run types:compile`

Expected: exit 0.

- [ ] **Step 5: Commit**

Run: `git add packages/ddp/ddp.d.ts packages/ddp/ddp.test-d.ts && git commit -m "fix(types): align DDP declarations with runtime"`

### Task 2: Accounts Hook Payloads

**Files:**
- Modify: `packages/accounts-base/accounts-base.test-d.ts`
- Modify: `packages/accounts-base/accounts-base.d.ts`

**Interfaces:**
- Consumes: server validation attempt fields from `accounts_server.js` and client hook/page-load payloads from `accounts_client.js` and `accounts-oauth/oauth_client.js`.
- Produces: `Accounts.LoginHookCallbackOptions`, `Accounts.PageLoadLoginAttemptInfo`, corrected `IValidateLoginAttemptCbOpts`, and optional logout user.

- [ ] **Step 1: Write the failing declaration regressions**

Exercise `onPageLoadLogin(info => info.type/info.allowed/info.error)`, a client failure hook containing only `error`, validation attempts where `user` and `error` may be absent, and an `onLogout` callback that narrows an absent user.

- [ ] **Step 2: Verify RED**

Run: `npm run types:compile`

Expected: the page-load callback parameter is missing and runtime-optional fields are declared as required.

- [ ] **Step 3: Implement the minimal declaration fix**

Keep validation metadata required except `user`/`error`; use an all-optional isomorphic hook interface for client/server login callbacks; add the required page-load metadata interface with optional error; make `onLogout.user` optional.

- [ ] **Step 4: Verify GREEN**

Run: `npm run types:compile`

Expected: exit 0.

- [ ] **Step 5: Commit**

Run: `git add packages/accounts-base/accounts-base.d.ts packages/accounts-base/accounts-base.test-d.ts && git commit -m "fix(types): model Accounts hook payloads"`

### Task 3: Session ObjectID Support

**Files:**
- Modify: `packages/session/session.test-d.ts`
- Modify: `packages/session/session.d.ts`

**Interfaces:**
- Consumes: structural `Mongo.ObjectID` methods `toHexString()` and `equals()`.
- Produces: ObjectID-compatible `SessionValue` and `Session.equals` without importing `meteor/mongo` from Session's declaration.

- [ ] **Step 1: Write the failing declaration regression**

Import `Mongo` in the test, instantiate `new Mongo.ObjectID()`, and pass it to `Session.set`, `Session.setDefault`, and `Session.equals`.

- [ ] **Step 2: Verify RED**

Run: `npm run types:compile`

Expected: `Mongo.ObjectID` is rejected by Session's current unions.

- [ ] **Step 3: Implement the minimal declaration fix**

Add a private structural ObjectID interface and include it in `SessionValue` and the scalar accepted by `Session.equals`.

- [ ] **Step 4: Verify GREEN**

Run: `npm run types:compile`

Expected: exit 0.

- [ ] **Step 5: Commit**

Run: `git add packages/session/session.d.ts packages/session/session.test-d.ts && git commit -m "fix(types): accept Mongo ObjectIDs in Session"`

### Task 4: `api.types()` Input Validation

**Files:**
- Modify: `tools/isobuild/package-api.test.js`
- Modify: `tools/isobuild/package-api.js`

**Interfaces:**
- Consumes: `isTypeScriptSourcePath`, normalized package-relative paths, and `buildmessage.error`.
- Produces: declaration/source mode validation with no partial `_typesEntry`, `_typesModules`, or `_typesDir` state after failure.

- [ ] **Step 1: Write failing validation tests**

Add literal cases for `README.md`, single-file `.txt` modules, directory entries/modules without `.d.ts`, and invalid module keys containing empty, dot, parent, or backslash segments. Assert errors and null metadata.

- [ ] **Step 2: Verify RED**

Run: `npm run test:unit -- --runTestsByPath tools/isobuild/package-api.test.js`

Expected: the invalid inputs are currently accepted.

- [ ] **Step 3: Implement the minimal validation**

Add predicates for `.d.ts` paths and valid module subpaths. Validate all fields into local normalized values before assigning any instance metadata. Require `.ts/.tsx` modules in source mode and `.d.ts` modules in declaration/directory mode.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test:unit -- --runTestsByPath tools/isobuild/package-api.test.js`

Expected: all package API tests pass.

- [ ] **Step 5: Commit**

Run: `git add tools/isobuild/package-api.js tools/isobuild/package-api.test.js && git commit -m "fix(isobuild): validate api.types inputs"`

### Task 5: Collision-Free Submodule Output

**Files:**
- Modify: `tools/isobuild/types-generator.test.js`
- Modify: `tools/isobuild/types-generator.js`

**Interfaces:**
- Consumes: validated module keys from `PackageAPI` and legacy `package-types.json` module maps.
- Produces: `normalizeModuleFileName(moduleName)` returning a `module-*.d.ts` filename whose escaped payload distinguishes underscore, colon, and slash.

- [ ] **Step 1: Write failing generator regressions**

Replace the old `index`-is-skipped assertion with an emitted-module assertion. Add one isopack declaring `a/b`, `a::b`, and `a__b`; assert four distinct files, correct `declare module` identities, and four barrel references including the main entry.

- [ ] **Step 2: Verify RED**

Run: `npm run test:unit -- --runTestsByPath tools/isobuild/types-generator.test.js`

Expected: `index` is absent and at least two collision-case modules overwrite the same output.

- [ ] **Step 3: Implement the encoder**

Keep package normalization unchanged. Add a module-specific function that first maps `_` to `_u`, then `:` to `_c`, then `/` to `_s`, prefixes `module-`, and appends `.d.ts`. Use it in single-file, directory, and TypeScript-source generation. Quote module identifiers with `JSON.stringify` when generating ambient modules and stubs.

- [ ] **Step 4: Update existing exact-path expectations and verify GREEN**

Run: `npm run test:unit -- --runTestsByPath tools/isobuild/types-generator.test.js`

Expected: all generator tests pass, including all three generation modes.

- [ ] **Step 5: Commit**

Run: `git add tools/isobuild/types-generator.js tools/isobuild/types-generator.test.js && git commit -m "fix(isobuild): preserve api.types submodules"`

### Task 6: Keep Core Declarations Out of Client Assets

**Files:**
- Modify: `packages/reload/package.js`
- Modify: `packages/facts-ui/package.js`
- Modify: `tools/tests/typescript.js`

**Interfaces:**
- Consumes: `api.types()` package metadata and the native generator's `.meteor/types/packages/<package>/index.d.ts` output.
- Produces: reload/facts-ui declarations available to TypeScript without browser asset entries.

- [ ] **Step 1: Add a failing build-level self-test**

Create a TypeScript app, add `facts-ui`, run `meteor types` and a directory build, assert the two generated package declarations exist, and assert browser program metadata contains neither `reload.d.ts` nor `facts-ui.d.ts`.

- [ ] **Step 2: Verify RED**

Run: `./meteor self-test --retries 0 "core package declarations are not client assets"`

Expected: browser output contains the declaration assets.

- [ ] **Step 3: Register both declarations through `api.types()`**

Replace each `api.addAssets(<declaration>, "client")` call with `api.types(<declaration>)`.

- [ ] **Step 4: Verify GREEN**

Run: `./meteor self-test --retries 0 "core package declarations are not client assets"`

Expected: generated declarations exist and browser output excludes them.

- [ ] **Step 5: Commit**

Run: `git add packages/reload/package.js packages/facts-ui/package.js tools/tests/typescript.js && git commit -m "fix(types): keep declarations out of client assets"`

### Task 7: TypeScript Template Self-Test Reliability

**Files:**
- Modify only after root-cause confirmation: `tools/tests/typescript.js`

**Interfaces:**
- Consumes: a template's installed `node_modules/typescript/bin/tsc` and self-test sandbox command execution.
- Produces: a test that proves the template-installed compiler exists and invokes it directly, without npm package fallback.

- [ ] **Step 1: Reproduce and retain evidence**

Run the publish-types/template pair with retries disabled and the self-test option/environment that preserves the sandbox. Inspect the generated `package.json`, lockfile, `node_modules/typescript/package.json`, npm configuration, and complete npm install/exec output.

- [ ] **Step 2: State and minimally test one root-cause hypothesis**

Compare a failing combined sandbox with a passing standalone sandbox. Confirm whether the local TypeScript package is absent, omitted, or merely bypassed by `npm exec` before changing the test.

- [ ] **Step 3: Add the failing deterministic assertion**

Make the self-test assert the installed TypeScript package/version and execute `node_modules/typescript/bin/tsc` through the sandbox's Node runtime. Run against the known failing sequence to demonstrate the old command path is what failed.

- [ ] **Step 4: Verify standalone and combined GREEN**

Run: `./meteor self-test --retries 0 "typescript template works"`

Run: `./meteor self-test --retries 0 "publish TypeScript-authored package types|typescript template works"`

Expected: both commands pass once with no retry.

- [ ] **Step 5: Commit**

Run: `git add tools/tests/typescript.js && git commit -m "test(types): invoke the template compiler deterministically"`

### Task 8: Migration Documentation and Full Verification

**Files:**
- Modify: `v3-docs/docs/cli/using-core-types.md`
- Modify if mirrored content is needed: `docs/source/using-core-types.md`

**Interfaces:**
- Consumes: final public declaration and `api.types()` behavior.
- Produces: migration guidance that describes source-level compatibility risks and the supported package declaration contract.

- [ ] **Step 1: Add migration guidance**

Document native-type precedence, stricter runtime-correct signatures, accepted `api.types()` extensions, submodule path rules, generated filenames as implementation details, and the incremental adoption sequence.

- [ ] **Step 2: Run focused verification**

Run: `npm run types:compile`

Run: `npm run test:unit -- --runTestsByPath tools/isobuild/package-api.test.js tools/isobuild/types-generator.test.js`

Run: `./meteor self-test --retries 0 "core package declarations are not client assets|publish TypeScript-authored package types|typescript template works"`

- [ ] **Step 3: Run broad type verification**

Run: `npm run types:coverage`

Run: `npm run types:dts-test-coverage`

- [ ] **Step 4: Exercise a local application**

Create an isolated TypeScript app, run `meteor types`, run its local `tsc --noEmit`, build it, start it once, and verify an HTTP response.

- [ ] **Step 5: Audit the final diff**

Run: `git diff --check origin/typescript-changes-consolidated...HEAD`

Run: `git diff --name-only origin/typescript-changes-consolidated...HEAD`

Expected: no TypeScript 7/dev-bundle file appears, all intended tests/docs are present, and the worktree is clean after commits.

- [ ] **Step 6: Commit documentation**

Run: `git add v3-docs/docs/cli/using-core-types.md docs/source/using-core-types.md && git commit -m "docs(types): add native types migration guidance"`
