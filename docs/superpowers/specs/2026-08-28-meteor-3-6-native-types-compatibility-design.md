# Meteor 3.6 Native Types Compatibility Design

## Objective

Ship the native type infrastructure from PR 14685 without silently breaking
Meteor 3.6 applications. Compatibility includes runtime behavior, TypeScript
compilation, editor resolution, JavaScript projects with `jsconfig.json`, and
projects using the existing `zodern:types` package or `@types/meteor`.

## Compatibility policy

Meteor 3.6 keeps the type surface that applications could compile against
before this PR. Existing public declarations that were removed or narrowed are
restored. New, more accurate APIs may be added when additive; incompatible
corrections are deferred to Meteor 4. Legacy declarations are marked
`@deprecated` when TypeScript can expose both forms without changing overload
selection or inference.

Official Meteor 3.6 templates remain on the established provider order:
`@types/meteor` first and `zodern:types` as the package-type fallback. They do
not opt existing or newly created applications into native declarations.
Native declarations remain available explicitly through `meteor types` for
projects that remove the direct `zodern:types` constraint and configure the
native output.

## Provider ownership

The exact legacy package name is `zodern:types`.

- A direct `zodern:types` project constraint owns package type generation.
  Meteor removes stale `.meteor/types` output and does not run its native
  generator.
- A transitive `zodern:types` dependency does not own generation because its
  linter does not run for the application. Native generation may proceed.
- Meteor never rewrites an existing `tsconfig.json` or `jsconfig.json` during
  an update.
- The default 3.6 templates must not combine the native barrel and
  `@types/meteor` in one wildcard mapping. That combination prevents fallback
  after the barrel is found and loads conflicting declarations.
- JavaScript applications that do not opt in receive no new type-generation
  side effects from their default template configuration.

## Native artifact architecture

Generated declarations must be valid TypeScript inputs, not merely strings
that resemble declarations.

Each package gets a public adapter under
`.meteor/types/packages/<normalized-package>/`. Files that already declare
their own ambient modules are referenced verbatim. External-module files with
top-level imports or exports are copied to a private module location and loaded
through a bare-specifier adapter, following the existing directory-mode
`meteor-package-types` mechanism. They are never nested inside another ambient
module. Mixed external modules and module augmentations are loaded through the
same adapter so both their exports and augmentations execute.

The generated `packages.d.ts` only references these adapters. Package and
module names remain normalized for Windows-safe paths. Generation remains
idempotent and removes stale files and links when provider ownership changes.

## Public declaration compatibility

Changes to declarations follow these rules:

1. Restore removed names, overloads, constructor signatures, and fields from
   the Meteor 3.5/PR-base surface when applications can reference them.
2. Restore permissive `any` extension points that the PR narrowed to
   `unknown`, closed unions, or invariant constraints.
3. Preserve optionality and nullability accepted by the old declarations.
4. For functions whose old and new declarations differ only by return type,
   keep the old 3.6 return type; TypeScript cannot overload by return type
   without changing call-site behavior.
5. Keep additive async or corrected APIs when their names are distinct.
6. Use permissive callback argument types for runtime-dispatched APIs such as
   publications and methods.
7. Model Mongo identifiers as both strings and `Mongo.ObjectID` where runtime
   permits either.

The compatibility pass includes Meteor core, Accounts, Mongo/Minimongo,
Tracker, DDP, Email, BrowserPolicy, WebApp, Roles, OAuth, Session, and package
exports introduced or changed by this PR.

## Tests

Tests compile the generated output and consumer fixtures instead of relying on
text snapshots alone. Required coverage includes:

- single-file external declarations and mixed module augmentations;
- native-only projects under strict mode;
- direct and transitive `zodern:types` ownership transitions;
- legacy template resolution with `@types/meteor` and zodern;
- consumer fixtures for every restored public signature;
- TypeScript 4.9, the minimum supported 5.x line, the template version, and a
  current version where practical;
- Windows-safe normalized paths and stale-output cleanup;
- a JavaScript-only application build with no TypeScript configuration;
- package runtime/build smoke tests to prove the type work does not alter
  application assets or runtime exports.

## Non-goals

Meteor 3.6 will not make native declarations authoritative by default, migrate
user configuration automatically, remove external type providers, or enforce
the stricter type corrections intended for Meteor 4.
