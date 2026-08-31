# TypeScript Types for Meteor Packages

Meteor can generate TypeScript type declarations for all installed packages
when you explicitly run `meteor types`. In Meteor 3.6, ordinary build commands
do not create, remove, or replace generated declarations. Projects that list
`zodern:types` directly keep using that established provider; remove it only
when you are ready to opt in to the native generator.

## How It Works

When you run `meteor types`, Meteor scans the compiled packages in your project
and writes type declaration files to `.meteor/types/`:

```text
.meteor/types/
├── .gitignore                 ← written by the generator; keeps the folder untracked
├── packages.d.ts              ← barrel file with /// <reference> directives
├── packages/
│   ├── random/                ← one directory per package that ships types
│   │   └── index.d.ts         ← wraps the package's exports in declare module
│   ├── accounts-base/
│   │   ├── index.d.ts
│   │   └── node_modules       ← symlink to the package's bundled npm deps
│   └── react-meteor-data/
│       ├── index.d.ts
│       ├── module-suspense.d.ts ← one generated file per sub-path module
│       └── node_modules
└── node_modules/
    └── meteor-package-types   ← symlink to ../packages (bridge for packages
                                  that bundle a whole folder of declarations)
```

`packages.d.ts` is a single barrel file of `/// <reference path="…" />` directives.
Each package gets its own directory under `packages/`, whose `index.d.ts` wraps
the package's exports in a `declare module 'meteor/package-name' { … }` block so
TypeScript can resolve imports like:

```ts
import { Random } from "meteor/random";
import { Accounts } from "meteor/accounts-base";
```

When a package bundles its own npm dependencies, its directory also contains a
`node_modules` symlink pointing at the npm packages shipped inside the built
package (its isopack). Because the declaration files sit right next to that
symlink, TypeScript's normal Node-style resolution finds the npm types the
package's declarations import — with no extra configuration.

When a package bundles a whole directory of declaration files (the directory
form of `api.types()`, e.g. `api.types('dist-types/')`), that folder is copied
verbatim into the package's directory — so its files keep their relative
imports — and `index.d.ts` becomes a small stub that re-exports the folder's
entry file through the `meteor-package-types` symlink at the types root. The
symlink points back at the `packages/` directory, letting the stub use a bare
import specifier (relative specifiers are not allowed inside a
`declare module` block) that Node-style resolution follows automatically. It
is only created when at least one installed package ships types this way.

The generator also writes a `.gitignore` inside `.meteor/types/`, so the
generated files stay out of version control without any changes to your
project's own `.gitignore`.

## Setup

### New TypeScript apps

When you create a TypeScript project with `meteor create --typescript my-app`,
the generated `tsconfig.json` supports both the compatibility provider and a
later native opt-in:

```json
{
  "compilerOptions": {
    "skipLibCheck": true,
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

Meteor 3.6 TypeScript templates still install `zodern:types` directly so an
upgrade does not silently change the active declarations. The paths retain the
existing `@types/meteor` then `zodern:types` precedence; native declarations are
fallbacks only. While `zodern:types` is present, `meteor types` skips generation
without deleting either provider tree.

Core packages that already shipped declarations retain those Meteor 3.6 files
for zodern consumers. Their corrected native variants are registered separately
and are excluded from zodern's isopack discovery, so upgrading without opting
in does not merge or replace the established declarations.

### Existing TypeScript apps

If the project does not use `zodern:types` and you want the native declarations
to be the only Meteor provider, use the generated per-package adapters and
include the generated barrel for native sub-path and scoped-package declarations:

```json
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages/*"
      ]
    }
  },
  "exclude": [
    "./.meteor/local/isopacks/**",
    "./.meteor/local/plugin-cache/**",
    "./packages/**"
  ]
}
```

If the project already declares `files` or `include`, append
`.meteor/types/packages.d.ts` and keep the existing source patterns. Listing
the barrel as a `files` entry makes scoped packages and sub-path modules
available as ambient declarations; it must not be used as a direct `paths`
target because the barrel itself is not an external module.

`"skipLibCheck": true` is recommended. The generated declaration files can pull
in types from npm packages that live inside a Meteor package's own
`node_modules`, and your app may have another copy of the same package — with
lib check enabled, TypeScript reports duplicate-identifier errors when it
checks both copies. `skipLibCheck` skips type-checking of `.d.ts` files, which
avoids that noise.

::: warning Important: `exclude` must not block `.meteor/types`
Do **not** add `./.meteor/**` to `exclude` — that would hide the generated
types in `.meteor/types`. Excluding the heavyweight `.meteor/local` cache
directories, as shown above, is fine.
:::

::: tip `preserveSymlinks` is usually not needed
Older guides recommended `"preserveSymlinks": true` for `zodern:types`. This is
usually no longer required: the generated `.d.ts` files are real files, so
TypeScript never reaches them *through* a symlink. Only each package's
`node_modules` directory is a symlink, and ordinary resolution follows
directory symlinks just fine.
:::

::: warning Limitation: peer dependencies of a package's bundled npm deps
The per-package `node_modules` symlink points into the built package's own
bundled dependencies — for published packages, a directory under
`~/.meteor/packages/…`, outside your app. By default TypeScript resolves that
symlink to its real path, so when a bundled dependency's *own* typings import
a package that is **not** bundled with the Meteor package — typically a peer
dependency such as `react`, or an `@types/*` package that only your app
installs — the lookup walks up from the package store and can never reach your
app's `node_modules`. With `"skipLibCheck": true` this fails silently: the
affected types just degrade to `any`; with it off you see
`TS2307: Cannot find module …` errors located inside `~/.meteor/packages/…`.
If you hit this, add `"preserveSymlinks": true` to your `tsconfig.json` —
resolution then stays inside your app tree, so those imports resolve against
your app's `node_modules`.
:::

After running `meteor types`, TypeScript will resolve `meteor/random`,
`meteor/accounts-base`, and all other typed packages from the generated
declarations.

## JavaScript Apps

JavaScript apps can get the same Meteor-import IntelliSense as TypeScript apps
by adding a `jsconfig.json` to the project root and running `meteor types`.

Meteor 3.6 JavaScript templates do not add a `jsconfig.json` automatically, so
upgrading a JavaScript-only app does not start type generation or change editor
diagnostics. Add one explicitly when you want typed imports.

For existing JavaScript apps, add a `jsconfig.json`:

```json
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.js", "**/*.jsx"],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "/*": ["*"],
      "meteor/*": [
        ".meteor/types/packages/*"
      ]
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

After running `meteor types`, VS Code will resolve `meteor/random`,
`meteor/accounts-base`, etc. with full IntelliSense even in `.js` files.

::: tip Apps without either file
If a project has no `tsconfig.json` and no `jsconfig.json`, `meteor types`
reports that there is nothing to generate.
:::

## Sub-Path Imports

Some packages expose multiple entry points. For example,
`react-meteor-data` exposes a `suspense` sub-path with alternative imports:

```ts
// Main module:
import { useTracker } from "meteor/react-meteor-data";

// Or suspense sub-path:
import { useTracker } from "meteor/react-meteor-data/suspense";
```

When a package declares sub-path modules, Meteor generates a separate `.d.ts`
file for each sub-path inside the package's directory and adds the corresponding
`/// <reference>` entry to `packages.d.ts` automatically. Each sub-path file
wraps its exports in a `declare module 'meteor/pkg/sub-path'` block.

Generated filenames such as `module-suspense.d.ts` are implementation details.
Import the public module id (`meteor/react-meteor-data/suspense`) rather than
referencing files under `.meteor/types/packages/` directly.

## Bundling Types in Your Own Package

There are two ways to ship types with an Atmosphere package:

**`package-types.json`** (established community approach, used by `zodern:types`):

```json
{
  "typesEntry": "my-package.d.ts"
}
```

**`api.types()` in `package.js`** _(experimental)_:

```js
Package.onUse(function (api) {
  api.use("ecmascript");
  api.mainModule("my-package.js");
  api.types("my-package.d.ts");
});
```

See [Writing Atmosphere Packages — TypeScript Types](../packages/7.writing-atmosphere-packages#typescript-types)
for full details, including sub-path modules and the priority resolution order.

## Migrating an existing application

The compatibility template keeps the established providers before native
declarations. Native declarations become the source of truth only after an
explicit migration to the native-only `paths` configuration above. They follow
the current runtime APIs more closely and can reveal application errors that
older ambient types allowed.

Adopt them incrementally:

1. Keep `"skipLibCheck": true` while dependencies transition to native types.
2. Use `./.meteor/types/packages/*` as the `meteor/*` path and include
   `./.meteor/types/packages.d.ts` in `files` for sub-path/scoped declarations.
3. Run `meteor types`, followed by your local TypeScript compiler with
   `--noEmit`.
4. Fix errors in application code instead of editing `.meteor/types`; generated
   files are replaced by the next `meteor types` command.

Pay particular attention to callbacks and serialized values. Login hook fields
can be absent depending on whether the callback runs on the client or server,
and DDP arguments must be EJSON-serializable. Runtime-supported values such as
primitive DDP arguments and `Mongo.ObjectID` Session values are included in the
native declarations.

### Migrating from `zodern:types`

If your project currently uses the `zodern:types` package, you can remove it
once you have updated your `tsconfig.json`:

```bash
meteor remove zodern:types
```

The Meteor 3.6 TypeScript templates already contain the native fallback
entries. Existing projects should update `paths` as described in
[Setup](#setup), then remove the package and run `meteor types` once.
The public module format is compatible: Meteor's native generator produces the
same `declare module 'meteor/…'` identities that `zodern:types` produced. The
generated on-disk filenames are not a compatibility contract.
