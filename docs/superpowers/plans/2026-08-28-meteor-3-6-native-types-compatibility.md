# Meteor 3.6 Native Types Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR 14685 safe to ship in Meteor 3.6 without runtime, module-resolution, or TypeScript source compatibility breaks.

**Architecture:** Keep the established zodern/@types templates as the 3.6 default while retaining native generation as an explicit path. Generate real external modules plus ambient adapters instead of nesting declaration syntax, and restore the pre-PR public type surface wherever the PR removed or narrowed it.

**Tech Stack:** Meteor Isobuild, Node.js, Jest, Meteor selftests, TypeScript declaration files, TypeScript 4.9 through current.

**Spec:** `docs/superpowers/specs/2026-08-28-meteor-3-6-native-types-compatibility-design.md`

## Global Constraints

- Do not rewrite existing application `tsconfig.json` or `jsconfig.json` files.
- `zodern:types` is the exact legacy package name; a direct constraint owns generation.
- Do not require a Meteor 4 API or behavior.
- Preserve JavaScript runtime and package assets.
- TypeScript 3.6 compatibility changes must be widening or additive relative to the PR base surface.
- All source changes are made in `/tmp/meteor-pr-14685-review-20260828`, never the dirty primary checkout.

---

### Task 1: Compile generated declaration artifacts

**Files:**
- Modify: `tools/isobuild/types-generator.test.js`
- Modify: `tools/isobuild/types-generator.js`

**Interfaces:**
- Consumes: `generateTypes({ isopackCache, packageMap, projectMeteorDir })`
- Produces: valid `.meteor/types/packages.d.ts` and per-package adapters loadable by TypeScript.

- [ ] **Step 1: Add failing compiler-backed tests**

Add fixtures for a single-file external module and a mixed external
module/module-augmentation declaration. Generate output into a temporary
project and compile `packages.d.ts` plus a consumer with the TypeScript API:

```js
const program = ts.createProgram([packagesDts, consumerTs], {
  noEmit: true,
  strict: true,
  skipLibCheck: false,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
});
expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
```

Assert that generated output contains no nested `export declare` and that a
consumer can import named exports from both fixtures.

- [ ] **Step 2: Run the focused test and confirm TS1038/TS2306**

Run:

```bash
npm run test:unit -- tools/isobuild/types-generator.test.js --runInBand
```

Expected before the fix: the new compiler-backed cases fail with invalid
ambient syntax or a non-module adapter.

- [ ] **Step 3: Store external declarations as private modules**

For a non-ambient single-file declaration, copy the raw file below the
package output directory and generate the public adapter with the existing
bare-specifier pattern:

```ts
declare module 'meteor/pkg' {
  import exports = require('meteor-package-types/pkg/declarations/index');
  export = exports;
}
```

Preserve declarations that already own `declare module` blocks, create the
`meteor-package-types` link whenever a private module is emitted, and include
private files in stale-output bookkeeping. Apply the same rule to subpath
modules.

- [ ] **Step 4: Run generator tests**

Run the focused Jest file and require zero failures.

- [ ] **Step 5: Commit the isolated generator fix**

```bash
git add tools/isobuild/types-generator.js tools/isobuild/types-generator.test.js
git commit -m "fix: emit valid native type adapters"
```

### Task 2: Restore Meteor 3.6 provider precedence

**Files:**
- Modify: `tools/static-assets/skel-typescript/tsconfig.json`
- Modify: `tools/static-assets/skel-typescript/.meteor/packages`
- Modify: `tools/static-assets/skel-typescript-tailwind/tsconfig.json`
- Modify: `tools/static-assets/skel-typescript-tailwind/.meteor/packages`
- Modify: `tools/static-assets/skel-svelte/tsconfig.json`
- Modify: `tools/static-assets/skel-svelte/.meteor/packages`
- Modify: `tools/static-assets/skel-angular/tsconfig.json`
- Modify: `tools/static-assets/skel-angular/.meteor/packages`
- Modify: `tools/static-assets/skel-{blaze,chakra-ui,full,minimal,react,solid,tailwind}/jsconfig.json`
- Modify: `tools/tests/typescript.js`

**Interfaces:**
- Consumes: direct project constraint lookup for `zodern:types`.
- Produces: legacy-first templates and deterministic native/zodern ownership.

- [ ] **Step 1: Add/update transition assertions**

Keep tests proving direct zodern removes `.meteor/types` and transitive zodern
does not suppress native generation. Add assertions that generated TypeScript
templates contain:

```json
"meteor/*": [
  "./node_modules/@types/meteor/*",
  "./.meteor/local/types/packages.d.ts"
]
```

and directly list `zodern:types` in `.meteor/packages`.

- [ ] **Step 2: Confirm the current templates fail the compatibility test**

Run the focused TypeScript selftests and observe native-first mappings or the
missing zodern constraint.

- [ ] **Step 3: Restore legacy template configuration**

Restore the pre-PR provider order, `preserveSymlinks` where it existed, direct
`zodern:types` constraints, and legacy jsconfig paths. Do not remove the native
generator, command, or explicit opt-in support.

- [ ] **Step 4: Run template and provider selftests**

Run:

```bash
./meteor self-test --once typescript
```

Require the template, direct-zodern transition, transitive-zodern, failure
strictness, and JavaScript configuration cases to pass.

- [ ] **Step 5: Commit provider compatibility**

```bash
git add tools/static-assets tools/tests/typescript.js
git commit -m "fix: preserve Meteor 3.6 type provider precedence"
```

### Task 3: Restore the public TypeScript surface

**Files:**
- Modify: `packages/meteor/meteor.d.ts`
- Modify: `packages/check/check.d.ts`
- Modify: `packages/accounts-base/accounts-base.d.ts`
- Modify: `packages/accounts-password/accounts-password.d.ts`
- Modify: `packages/mongo/mongo.d.ts`
- Modify: `packages/minimongo/minimongo.d.ts`
- Modify: `packages/session/session.d.ts`
- Modify: `packages/tracker/tracker.d.ts`
- Modify: `packages/promise/promise.d.ts`
- Modify: `packages/ddp/ddp.d.ts`
- Modify: `packages/ddp-server/ddp-server.d.ts`
- Modify: `packages/email/email.d.ts`
- Modify: `packages/oauth/oauth.d.ts`
- Modify: `packages/browser-policy-common/browser-policy-common.d.ts`
- Modify: `packages/webapp/webapp.d.ts`
- Modify: `packages/roles/definitions.d.ts`
- Modify: `packages/accounts-2fa/accounts-2fa.d.ts`
- Modify: `packages/accounts-oauth/accounts-oauth.d.ts`
- Modify: `packages/service-configuration/service-configuration.d.ts`
- Modify: `packages/reload/reload.d.ts`
- Test: `tools/tests/apps/types/` or the nearest existing TypeScript fixture

**Interfaces:**
- Consumes: public declarations at PR base `cba359b90c2379b30f85f2c6460ee55dc399d153`.
- Produces: a declaration surface that accepts every pre-PR compatibility fixture while retaining additive native APIs.

- [ ] **Step 1: Add consumer fixtures for known regressions**

Compile code that exercises publication callbacks with typed arguments,
required-argument Match constructors, `Mongo.getCollection` with a custom
document type, string and `Mongo.ObjectID` identifiers, `Meteor.settings` and
Session extension values, removed aliases, Accounts return values, Promise
fiber helpers, BrowserPolicy methods, Email transport/MailComposer, WebApp
internals, Roles null groups, Tracker optionality, and DDP APIs.

Representative assertions:

```ts
Meteor.publish('owned', function (ownerId: string) { return null; });
Match.test(class NeedsArg { constructor(value: string) {} }, Match.Any);
const widgets: Mongo.Collection<{ _id?: Mongo.ObjectID; name: string }> =
  Mongo.getCollection('widgets');
Meteor.settings.custom.enabled;
Session.get('extension-key').customField;
```

- [ ] **Step 2: Confirm the fixtures fail against the uncorrected PR**

Compile with `strict: true` and `skipLibCheck: false`; record the expected
assignability, missing-name, overload, and nullability diagnostics.

- [ ] **Step 3: Restore compatible declarations**

Compare every changed existing declaration against the base. Restore removed
names and old call signatures, use deprecated aliases when both forms can
coexist, revert narrowed `unknown` extension points to `any`, preserve old
return types where TypeScript cannot overload by return type, change runtime
callbacks to permissive rest arguments, relax invariant Mongo helpers, and
model Mongo IDs as `string | Mongo.ObjectID`.

- [ ] **Step 4: Compile the fixture and declaration coverage project**

Require strict compilation with no diagnostics from the compatibility
fixture, then run the existing package type-coverage command.

- [ ] **Step 5: Commit the declaration compatibility pass**

```bash
git add packages tools/tests/apps/types
git commit -m "fix: preserve Meteor 3.6 public type compatibility"
```

### Task 4: Validate package exports and ecosystem declarations

**Files:**
- Modify: `packages/non-core/jquery/jquery.d.ts`
- Modify: `packages/non-core/jquery/package.js`
- Test: generated `react-meteor-data` declaration in the native integration fixture
- Test: generator compiler fixtures and package type coverage

**Interfaces:**
- Consumes: package exports exposed by Meteor runtime and existing external declaration providers.
- Produces: declaration entries that resolve without leaking assets or introducing stricter generic constraints.

- [ ] **Step 1: Add strict imports for mixed and ecosystem packages**

Compile direct imports for `meteor/accounts-2fa`, `meteor/accounts-express`,
`meteor/roles`, `meteor/jquery`, and `meteor/react-meteor-data`, including a
non-string-id Mongo document and a normal jQuery call.

- [ ] **Step 2: Confirm current strict diagnostics**

Require the tests to expose missing ambient roots, the suspense `Document`
constraint, or incomplete jQuery inference before changing declarations.

- [ ] **Step 3: Make entries additive and runtime-aligned**

Load mixed modules through adapters, relax the react-meteor-data generic to
the collection/document constraints supported by Meteor 3.6, and expose the
runtime jQuery export without replacing installed `@types/jquery` with an
incompatible private surface.

- [ ] **Step 4: Run package and asset tests**

Run strict TypeScript compilation plus package tests for every runtime package
whose declaration or manifest changed. Confirm `.d.ts` files do not appear in
client asset manifests.

- [ ] **Step 5: Commit ecosystem fixes**

```bash
git add packages tools/isobuild/types-generator.test.js
git commit -m "fix: align package type exports with Meteor 3.6"
```

### Task 5: Execute the release compatibility matrix

**Files:**
- Modify: tests only if verification exposes an uncovered regression

**Interfaces:**
- Consumes: completed generator, template, and declaration fixes.
- Produces: evidence for all five release scenarios.

- [ ] **Step 1: Native-only matrix**

Generate and compile a strict native-only app with TypeScript 4.9, 5.x, the
template version, and current TypeScript. Require no declaration syntax or
module-resolution errors.

- [ ] **Step 2: zodern-only matrix**

Compile the pre-PR template with `zodern:types` 1.0.13 and
`@types/meteor`, preserving its configuration.

- [ ] **Step 3: simultaneous-provider matrix**

Verify direct zodern removes native output and compiles through zodern only;
verify transitive zodern leaves native output and does not generate a second
application barrel.

- [ ] **Step 4: upgrade and JavaScript matrices**

Update an existing legacy-config fixture without editing its tsconfig and
compile it. Build a JavaScript app without TypeScript and compare runtime
assets/exports with the PR base.

- [ ] **Step 5: Run focused unit, selftest, and git checks**

Run generator Jest tests, TypeScript selftests, changed package tests, `git
diff --check`, and a final base-to-branch runtime-file diff review. Require
zero unexpected failures or whitespace errors.

- [ ] **Step 6: Commit any final test-only hardening**

```bash
git add tools packages
git commit -m "test: cover Meteor 3.6 type compatibility matrix"
```
