# PR 14685 Review Findings Stabilization Design

## Context

PR #14685 adds native package declaration generation and a broad set of core
package declarations. Local review found runtime/type mismatches in DDP,
Accounts, and Session, plus validation and output-name bugs in `api.types()`.
Two packages also register declarations as client assets, which makes `.d.ts`
files part of the client program instead of package metadata.

The TypeScript 7/dev-bundle integration is explicitly out of scope. Its three
compiler/version roles need a separate investigation before changing the
published dev bundle or the classic compiler.

## Goals

- Make the affected public declarations accept calls that the runtime already
  supports while retaining useful type safety.
- Make every accepted `api.types()` input produce declaration metadata, or fail
  early with an actionable package-build error.
- Generate a distinct, safe output file for every declared sub-path module,
  including the module name `index`.
- Register core package declarations through `api.types()` rather than shipping
  them to browsers as client assets.
- Make the TypeScript template self-test deterministic when run with the
  publish-types self-test and in the wider suite.
- Document migration risks caused by stricter native declarations and the
  `api.types()` contract.

## Non-goals

- Changing `scripts/dev-bundle-tool-package.js`, `BUNDLE_VERSION`,
  `@meteorjs/babel`, or the `typescript` package version.
- Migrating the classic TypeScript compiler to SWC or tsgo.
- Redesigning unrelated core package declarations.
- Changing runtime behavior for DDP, Accounts, or Session.

## Public declaration fixes

### DDP

`DDP.DDPStatic` will mirror the serializable argument and callback shapes of
the corresponding `Meteor` methods:

- method and subscription arguments accept `EJSONable | EJSONableProperty`,
  including primitives;
- `subscribe` accepts a ready callback or an `onReady`/`onStop` callback object;
- `call` accepts an optional result callback;
- `apply` accepts a readonly argument list, `Meteor.MethodApplyOptions`, and a
  typed result callback;
- `methods` uses `any[]` for handler parameters, matching `Meteor.methods`, so a
  handler may declare concrete parameters under `strictFunctionTypes`.

Compile-time regression tests will exercise each runtime-supported call form.

### Accounts

The declarations will distinguish three payloads that the current declaration
conflates:

- validation attempts have required `type`, `allowed`, `connection`,
  `methodName`, and `methodArguments`, with optional `error` and `user`;
- login hook payloads are isomorphic and therefore expose their client- and
  server-only fields as optional;
- page-load login information has required attempt metadata and an optional
  error, matching resume and OAuth runtime producers.

`onPageLoadLogin` will receive its payload, and `onLogout.user` will be optional
because logout can occur without a resolvable user. Type tests will cover the
client failure shape, page-load fields, server validation fields, and a missing
logout user.

### Session

Session values and `Session.equals` will accept a structural Mongo ObjectID
shape (`toHexString()` plus `equals()`) without adding a hard dependency from
the client-only `session` package to `mongo`. A type regression will pass an
actual `Mongo.ObjectID` to `set`, `setDefault`, and `equals`.

## `api.types()` validation

Single-file mode will accept only declaration files (`.d.ts`) or TypeScript
source entries (`.ts`/`.tsx`, excluding `.d.ts` from source mode). Module files
must match the selected mode. Directory mode entries and modules must resolve
inside the declared directory and end in `.d.ts`.

Invalid extensions will produce `buildmessage.error` and leave all internal
type metadata unset. Tests will first reproduce acceptance of `README.md`,
non-declaration module files, and non-declaration directory entries.

Module keys will be validated as non-empty POSIX sub-paths without empty,
`.`/`..`, or backslash segments. Generated module identifiers will be quoted
safely.

## Collision-free generated module files

Package directory normalization remains unchanged. Sub-path modules get a
separate filename encoder and a `module-` prefix. The encoder escapes every
underscore before encoding colon and slash, making names such as `a/b`,
`a::b`, and `a__b` distinct. The prefix reserves `index.d.ts` for the package
entry, so a sub-path named `index` is emitted normally.

The same encoder will be used in single-file, directory, and TypeScript-source
modes. Existing generator tests will be updated to assert module identity and
barrel references rather than depending on the old readable filename where
possible. New regressions will prove all collision cases and `index` output.

## Declaration registration

`reload` and `facts-ui` will replace `api.addAssets(<file>, "client")` with
`api.types(<file>)`. A build-level regression will verify that declarations are
discoverable by the native type generator and absent from the browser asset
program.

## Self-test reliability

The combined self-test failure will be investigated from retained sandbox
state and command output before any change. The acceptance requirement is that
the created TypeScript template installs its declared local TypeScript package
and invokes that local compiler without permitting `npm exec` to download or
select the unrelated `tsc` package. The standalone and combined test sequences
must both pass with retries disabled.

## Documentation and compatibility

The native-types guide will add a migration section covering:

- native declarations taking precedence over `@types/meteor`;
- stricter but runtime-correct callback and EJSON argument types;
- `api.types()` extension and sub-path validation;
- generated declaration paths being implementation details;
- the recommended incremental adoption workflow (`skipLibCheck`, run
  `meteor types`, then fix application errors).

No runtime breaking change is introduced. Declaration corrections can reveal
previously hidden application type errors and are therefore documented as a
source-level migration concern.

## Verification

Each production behavior starts with a focused failing regression. Verification
then expands through:

1. declaration compilation for the affected packages;
2. `package-api` and `types-generator` Jest suites;
3. focused self-tests, standalone and combined with retries disabled;
4. native type coverage and declaration coverage;
5. a local application that generates types, compiles with `tsc`, builds, and
   starts;
6. final diff review confirming no TypeScript 7/dev-bundle file changed.
