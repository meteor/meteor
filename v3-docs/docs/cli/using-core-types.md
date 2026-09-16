# TypeScript Types for Meteor Packages

Starting with Meteor 3.6, Meteor can generate TypeScript declarations for
installed packages that publish type information. This is an explicit opt-in:
run `meteor types` to write the declarations to `.meteor/types/`. Ordinary
commands such as `meteor run`, `meteor build`, `meteor test`, and `meteor lint`
do not create, remove, or select native declarations.

Meteor 3.6 also preserves the existing type providers used by an application.
If your app lists `zodern:types` directly, that package remains in control and
`meteor types` exits successfully without modifying either provider's output.

::: info Compilation and declarations are separate
The [`typescript` package](/packages/typescript) and Rspack transpile `.ts` and
`.tsx` application files. They do not type-check your application and do not
choose its Meteor declaration provider. This guide covers declarations and
editor/`tsc` resolution.
:::

## Choose a Type Provider

| Project state | Recommended action |
| --- | --- |
| Existing app using `@types/meteor` or `zodern:types` | Keep the current configuration if you do not want type changes during the Meteor 3.6 upgrade. |
| App ready to adopt native declarations | Remove a direct `zodern:types` dependency, run `meteor types`, then stop loading `@types/meteor` and configure the native paths. |
| New Meteor 3.6 TypeScript app | The template preserves `@types/meteor` and `zodern:types`; native declarations are only a fallback until you explicitly migrate. |
| JavaScript app that wants Meteor IntelliSense | Add a `jsconfig.json`, configure the native paths, and run `meteor types`. |

Native declarations follow the Meteor 3.6 runtime APIs more closely, but
opting in can reveal errors that an older provider did not report. Keeping the
provider choice explicit lets you adopt those corrections separately from the
framework upgrade.

## Enable Native Types in a TypeScript App

### 1. Remove `zodern:types` when you are ready

Skip this step if the app does not list the package directly.

```bash
meteor remove zodern:types
```

`meteor types` deliberately skips native generation while a direct
`zodern:types` constraint is present. A transitive dependency on the package
does not take ownership of generation.

### 2. Generate the native declarations

```bash
meteor types
```

`meteor types` builds local packages as needed, but it does not bundle the app,
run linters, or type-check application code. After successful native
generation, Meteor removes stale `.meteor/local/types` output left by a
previous direct `zodern:types` installation. If generation fails, that legacy
output is preserved so you can restore the previous provider.

### 3. Configure `tsconfig.json`

After generation succeeds, map normal package imports to the generated
per-package adapters and include the generated barrel for scoped packages and
sub-path modules:

```json [tsconfig.json]
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "meteor/*": ["./.meteor/types/packages/*"]
    }
  },
  "exclude": [
    "./.meteor/local/isopacks/**",
    "./.meteor/local/plugin-cache/**",
    "./packages/**"
  ]
}
```

To make the native declarations the only provider, also remove a directly
installed `@types/meteor` package after generation succeeds:

```bash
meteor npm uninstall @types/meteor
```

Check every `tsconfig.json` used by the application, including configurations
reached through `extends`. If `compilerOptions.types` contains `"meteor"`,
remove only that entry and keep the other type libraries. Otherwise TypeScript
continues loading the old ambient declarations alongside the native provider.

If your project already has `files`, append
`./.meteor/types/packages.d.ts`. If it already has `include`, keep its existing
source patterns instead of replacing them with the example above.

The two generated paths serve different purposes:

- `.meteor/types/packages/*` resolves ordinary imports such as
  `meteor/random` through a per-package `index.d.ts`.
- `.meteor/types/packages.d.ts` references ambient declarations for scoped
  package names and sub-paths such as `meteor/react-meteor-data/suspense`.

Do not map `meteor/*` directly to `packages.d.ts`; the barrel is not an
external module.

::: warning Include the generated barrel explicitly
Some Meteor templates exclude `./.meteor/**`. TypeScript's `files` entries are
still explicit, so keep `./.meteor/types/packages.d.ts` in `files` when opting
in. Without that entry, scoped package names and sub-path ambient declarations
can be missing even when ordinary package imports resolve through `paths`.
:::

### 4. Check the application {#check-the-application}

Use the application's locally installed TypeScript compiler. Confirm that
`typescript` is already listed in `devDependencies`; if it is not, add a
version compatible with the project. Keep that compiler version unchanged
while migrating declaration providers so the two changes can be validated
separately.

A package script keeps generation and type-checking together locally and in
CI. `npm run` resolves `tsc` from the application's `node_modules`:

```json [package.json]
{
  "scripts": {
    "check-types": "meteor types && tsc --noEmit"
  }
}
```

```bash
meteor npm run check-types
```

Generated files are replaced by the next successful `meteor types` run. Do not
edit or commit `.meteor/types/`; the generator writes a `.gitignore` inside the
directory.

## Existing Meteor 3.6 Templates

Meteor 3.6 TypeScript templates retain the established provider order:

```json
{
  "compilerOptions": {
    "paths": {
      "meteor/*": [
        "./node_modules/@types/meteor/*",
        "./.meteor/local/types/packages.d.ts",
        "./.meteor/types/packages/*"
      ]
    }
  }
}
```

The template also installs `zodern:types` directly. As a result, upgrading or
creating an app does not silently replace its active declarations. The native
path is only a fallback; follow the native setup above when you want to switch
providers.

Core packages that already exposed declarations in Meteor 3.6 keep those
legacy files unchanged for existing providers. Corrected native declarations
are stored separately and only selected by `meteor types`.

## JavaScript Apps

JavaScript apps can opt in to the same Meteor-import IntelliSense with a
`jsconfig.json`:

```json [jsconfig.json]
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.js", "**/*.jsx"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "/*": ["*"],
      "meteor/*": ["./.meteor/types/packages/*"]
    },
    "moduleResolution": "node",
    "resolveJsonModule": true
  },
  "exclude": [
    "./.meteor/local/isopacks/**",
    "./.meteor/local/plugin-cache/**",
    "./packages/**"
  ]
}
```

Then run:

```bash
meteor types
```

Meteor 3.6 JavaScript templates do not add `jsconfig.json` automatically, so
ordinary JavaScript-only projects remain unchanged unless they opt in.

## Generated Output

The generated directory has one adapter directory per package that publishes
types, plus a barrel of references:

```text
.meteor/types/
├── .gitignore
├── package.json
├── packages.d.ts
├── packages/
│   ├── random/
│   │   └── index.d.ts
│   └── react-meteor-data/
│       ├── index.d.ts
│       └── module-suspense.d.ts
└── node_modules/
    └── meteor-package-types -> ../packages  # created only when needed
```

Package authors can publish a single declaration, sub-path declarations, a
whole declaration directory, or TypeScript source metadata. Meteor preserves
relative imports and links bundled npm dependencies when necessary. Generated
filenames such as `module-suspense.d.ts` and the symlink layout are internal
details; application code should only import public module ids:

```ts
import { Random } from "meteor/random";
import { useTracker } from "meteor/react-meteor-data/suspense";
```

Packages that do not publish type information are omitted. Prefer one provider
for Meteor module ids. A deliberate hybrid can use `@types/meteor` for an
uncovered module, but overlapping declarations can merge or conflict and must
be checked with `tsc`.

## Migrating from `zodern:types`

Use the following order so a failed native generation leaves the previous
provider available for rollback:

1. Remove `zodern:types` from `.meteor/packages` with
   `meteor remove zodern:types`.
2. Run `meteor types`. Do not change the provider paths if this step fails.
3. After generation succeeds, update `tsconfig.json` with the native `files`
   and `paths` entries, uninstall a direct `@types/meteor` dependency, and
   remove `"meteor"` from any `compilerOptions.types` list.
4. Run the application's local `tsc --noEmit` through a package script and fix
   application errors reported by the corrected declarations.

After native generation succeeds, Meteor removes the old
`.meteor/local/types` output left by a previous direct `zodern:types`
installation. If native generation fails, the legacy output is preserved so
you can restore the previous provider.

To roll back, restore the legacy provider packages you removed, restore the
previous provider order and `compilerOptions.types` entries, and regenerate
`zodern:types` declarations using the workflow your app already used. Ordinary
Meteor commands and a skipped `meteor types` run do not delete either provider
tree.

## Troubleshooting

### `meteor types` says there is nothing to do

The command requires a `tsconfig.json` or `jsconfig.json` in the application
root. Add the appropriate configuration and run it again.

### `meteor types` skips because `zodern:types` is installed

This is the compatibility behavior in Meteor 3.6. Keep using `zodern:types`, or
remove the direct dependency when you are ready to adopt native declarations.
The skipped command exits successfully and does not delete generated files.

### Type generation fails

`meteor types` exits with a non-zero status and leaves the failure visible in
the terminal, making it safe to use as a CI prerequisite. Run with `--verbose`
for more diagnostic output. Ordinary build commands remain unaffected because
they do not run the native generator.

### A bundled npm dependency loses peer types

Generated package directories can link to npm dependencies bundled inside an
isopack. TypeScript normally resolves that symlink to the package store, where
it cannot see peer dependencies installed only in the app. Symptoms include a
`TS2307` error under `~/.meteor/packages/`, or a type silently degrading to
`any` when `skipLibCheck` is enabled.

If this occurs, add `"preserveSymlinks": true` to `compilerOptions` so
resolution remains inside the application tree and can reach the app's
`node_modules`.

## Publishing Types from an Atmosphere Package

Meteor 3.6 adds the experimental `api.types()` package API while retaining the
established `package-types.json` format. See
[Writing Atmosphere Packages — TypeScript Types](../packages/7.writing-atmosphere-packages#typescript-types)
for single-file declarations, sub-paths, directory mode, publication from
TypeScript sources, and provider compatibility.
