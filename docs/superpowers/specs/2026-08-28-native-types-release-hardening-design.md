# Native types release hardening

Status: approved
Date: 2026-08-28
Owners: Meteor core

## Goal

Make native package declarations deterministic across `meteor publish` and
`meteor publish-for-arch`, enforce package typing breadth in CI, and ensure
declaration files never become browser assets. Close the remaining test gaps
around `zodern:types`, generator failures, and stale compatibility symlinks.

## Problems being solved

### `publish-for-arch` recompiles declarations

The initial `meteor publish` compiles a TypeScript-authored `api.types()` entry
into `.types-build/`, validates the expected output, and builds an isopack from
those declarations. The source archive still contains the original
`package.js`, so `publish-for-arch` parses `api.types('index.ts')` again and
runs `tsc` a second time.

That second compilation is not guaranteed to have the same inputs. The source
archive is built from isopack watch sets, while the first compilation may have
read a `tsconfig.json`, an extended configuration, or type-only files that are
not represented in those watch sets. A remote architecture build can therefore
publish declarations that differ from the declarations approved by the
original publish.

### The breadth checker is informational only

`scripts/type-coverage/check-type-breadth.js` supports `--strict`, but the type
coverage workflow never invokes it in strict mode. Packages can consequently be
added without declarations or an explicit waiver without blocking CI.

### jQuery declarations are client assets

`packages/non-core/jquery/package.js` registers `jquery.d.ts` through
`api.addAssets(..., 'client')`. This makes a type-only file part of the browser
asset set even though it is needed only by the declaration generator.

## Non-goals

- Reproduce an author's complete TypeScript build environment on remote
  architecture builders.
- Change the public `api.types()` syntax or isopack metadata format.
- Change the compatibility behavior for applications that directly install
  `zodern:types`.
- Turn declaration-generation failures into fatal errors for ordinary app
  builds. Only the explicit `meteor types` command is strict.
- Raise the current type quality threshold. This work makes the existing
  package-breadth policy enforceable.

## Chosen design

### Generate once and reuse the generated declarations

The declaration output produced during the initial publish is authoritative.
The publication flow becomes:

1. Parse the package's TypeScript `api.types()` entry.
2. Run `tsc` once in the package author's environment.
3. Validate that the entry and every configured subpath module were emitted.
4. Rewrite the in-memory `PackageSource` to directory mode using
   `.types-build`.
5. Build the isopack from those declarations.
6. Explicitly add the generated `.d.ts` and `.d.ts.map` files to the source
   archive.
7. On `publish-for-arch`, derive the same declaration paths from the original
   `api.types()` metadata, validate the archived files, rewrite the
   `PackageSource` to directory mode, and build without invoking `tsc`.

This keeps every architecture build on the exact declarations that were
validated during the original publish. It also avoids making source archive
correctness depend on an incidental watch-set entry.

### Why not compile again from a copied `tsconfig`

Copying only `tsconfig.json` is insufficient because it can extend files outside
the package, reference other projects, or include type-only inputs that the
isopack does not watch. Computing the entire TypeScript input closure would
duplicate compiler behavior and still depend on the compiler and filesystem of
the remote builder.

### Why not synthesize a normalized TypeScript configuration

A generated configuration would make the second build more reproducible, but
it could change module resolution, path mappings, ambient types, declaration
transforms, or compiler-version behavior. It would still permit architecture
build declarations to differ from the initially published declarations.

## Components

### Declaration preparation helper

The current declaration generation code mixes two responsibilities:

- executing `tsc`;
- mapping source entries to `.types-build/**/*.d.ts`, checking the files, and
  rewriting `PackageSource`.

Extract the second responsibility into a reusable helper. It accepts a
`PackageSource`, a package directory, and the generated directory name. It:

- normalizes leading `./` segments;
- maps `.ts` and `.tsx` entry/module paths to `.d.ts` paths under
  `.types-build`;
- rejects a missing entry or module declaration with a diagnostic that names
  both the source path and expected declaration path;
- mutates `typesDir`, `typesEntry`, and `typesModules` only after all expected
  files validate.

The initial publish calls this helper after `tsc`. `publish-for-arch` calls the
same helper directly on the extracted source archive and never starts a
compiler.

### Source archive inclusion

When `package-client` assembles the source bundle for a package whose built
isopack uses `.types-build`, it explicitly enumerates generated declaration
artifacts below that directory and unions them into the source list passed to
`bundleSource`.

Only `.d.ts` and `.d.ts.map` files are added. Compiler state such as
`.tsbuildinfo` is not published. Paths continue through the existing source
bundle path validation and package-root containment checks.

An empty or incomplete declaration directory blocks the original publish. A
source archive missing expected prebuilt declarations blocks
`publish-for-arch`; it does not fall back to recompiling.

### Strict breadth gate

Refactor `check-type-breadth.js` into small importable functions with a CLI
wrapper:

- discover package directories beneath a supplied root;
- load a supplied manifest;
- classify packages as typed, missing, waived, or unclassified;
- format the report;
- return an exit decision for strict mode.

The default CLI paths remain unchanged. Add root `package.json` scripts for the
strict check and its focused Node tests, then run both from
`.github/workflows/type-coverage.yml`. Missing and unclassified packages become
blocking failures.

### jQuery declaration registration

Replace the client `api.addAssets('jquery.d.ts', 'client')` call with
`api.types('jquery.d.ts')`. The existing native types pipeline registers the
declaration on the server side, generates the `meteor/jquery` declaration stub,
and keeps the file out of browser assets.

### Compatibility symlink lifecycle

The generator creates
`.meteor/types/node_modules/meteor-package-types -> ../packages` only while at
least one package needs directory-mode or TypeScript-source path resolution.
After each successful generation, if no current package needs the link, remove
an existing link. Removal is limited to that exact path and does not touch the
generated package declarations directory.

## Error handling

### Publish commands

- A failed `tsc` during the initial `publish` remains fatal and prints the
  compiler diagnostics.
- Missing expected output after the initial compilation is fatal.
- Missing expected `.types-build` output during `publish-for-arch` is fatal and
  explains that the source bundle lacks the declarations generated by the
  original publish.
- `publish-for-arch` never recompiles as a fallback because that would recreate
  the nondeterminism this design removes.

### Application generation

- Native generation during an ordinary build remains best-effort: the build
  reports a warning and proceeds.
- `meteor types` remains explicit and strict: the same generator failure exits
  non-zero.
- A transitively installed `zodern:types` does not disable native generation.
  Only a direct application constraint invokes the compatibility skip and stale
  native output cleanup.

## Test strategy

All behavior changes are implemented test-first.

### Publish/source bundle tests

Add a roundtrip test that:

1. Creates a TypeScript-authored package and generates `.types-build`.
2. Builds a real source tarball containing the generated declarations.
3. Extracts it into a fresh directory without relying on the original
   `tsconfig.json` or type-only source inputs.
4. Prepares the extracted `PackageSource` for an architecture build without
   invoking `tsc`.
5. Verifies the entry and subpath module metadata and declaration bytes match
   the original publish output.

Add negative coverage for a source bundle with a missing entry declaration and
with a missing subpath declaration. Both must fail with the expected prebuilt
declaration diagnostic.

### Breadth checker tests

Use temporary package trees and manifests to cover:

- every required package typed: strict mode passes;
- a required package without `.d.ts`: strict mode fails;
- an unclassified package: strict mode fails;
- a waived package: it is reported but does not fail;
- nested packages and excluded submodule paths are classified correctly.

The CI test invokes behavior through exported functions or a child process; it
does not assert implementation text with grep.

### Browser asset test

Extend the package declaration self-test to build an application using jQuery,
run native declaration generation, and assert:

- a generated `meteor/jquery` declaration exists;
- the browser program contains no `jquery.d.ts` asset;
- preferably, no `.d.ts` path is present in the browser asset list.

### `zodern:types` tests

Retain the direct-dependency transition test. Add a transitive dependency
fixture that includes `zodern:types` below another package and assert native
declarations are still generated. The test must establish that the application
does not directly constrain `zodern:types`.

### Failure semantics tests

Create a deterministic filesystem obstruction in the generated types path so
the same generation attempt fails in two command paths:

- an ordinary app build completes and reports the nonfatal warning;
- `meteor types` exits non-zero and reports the failure.

The fixture is removed in cleanup so it cannot contaminate later self-tests.

### Symlink cleanup test

Start with a package that requires the global `meteor-package-types` symlink,
generate types, then replace the package set with declarations that do not need
it. A second generation must remove the stale symlink while preserving current
declaration files.

## Verification

Run, at minimum:

- focused declaration generator unit tests;
- focused breadth checker Node tests;
- TypeScript tool self-tests, including the publish roundtrip and browser asset
  assertions;
- `npm run types:compile`;
- `npm run types:test`;
- `npm run types:coverage`;
- the strict breadth command;
- workflow syntax validation or the repository's equivalent CI validation.

Long-running suites that cannot complete locally must be reported with the
exact command, observed output, and reason; they must not be described as
passing.
