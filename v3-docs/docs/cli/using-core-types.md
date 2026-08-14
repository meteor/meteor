# TypeScript Types for Meteor Packages

Meteor automatically generates TypeScript type declarations for all installed
packages whenever you run `meteor run` or `meteor build`. No extra packages or
manual steps are required.

## How It Works

During every build, Meteor scans the compiled packages in your project and
writes type declaration files to `.meteor/types/`:

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
│       ├── suspense.d.ts      ← one extra file per sub-path module
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
the generated `tsconfig.json` already has the correct `paths` configuration:

```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages.d.ts",
        "./node_modules/@types/meteor/*"
      ]
    }
  }
}
```

The native types take priority. `@types/meteor` remains as a fallback for
packages that have not yet bundled their own types.

### Existing TypeScript apps

Update your `tsconfig.json` `paths` entry so that `.meteor/types/packages.d.ts`
comes **before** `@types/meteor`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "meteor/*": [
        "./.meteor/types/packages.d.ts",
        "./node_modules/@types/meteor/*"
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

::: tip No `preserveSymlinks` needed
Older guides recommended `"preserveSymlinks": true` for `zodern:types`. This is
no longer required: the generated `.d.ts` files are real files, so TypeScript
never reaches them *through* a symlink. Only each package's `node_modules`
directory is a symlink, and ordinary resolution follows directory symlinks just
fine.
:::

After running `meteor types` once, or starting the app with `meteor run`,
TypeScript will resolve `meteor/random`, `meteor/accounts-base`, and all other
typed packages from the auto-generated declarations.

## JavaScript Apps

JavaScript apps can get the same Meteor-import IntelliSense as TypeScript apps
by adding a `jsconfig.json` to the project root. Meteor detects **either**
`tsconfig.json` or `jsconfig.json` and generates the types accordingly.

Apps created with `meteor create` (without `--typescript`) already include a
`jsconfig.json` with the right configuration. The exception is
`meteor create --bare`, which stays true to its minimal philosophy and ships
no `jsconfig.json` — add one yourself (see below) if you want typed imports.

For existing JavaScript apps, add a `jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "/*": ["*"],
      "meteor/*": [".meteor/types/packages.d.ts"]
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

After running `meteor types` once, or starting the app with `meteor run`,
VS Code will resolve `meteor/random`, `meteor/accounts-base`, etc. with full
IntelliSense even in `.js` files.

::: tip Apps without either file
If a project has no `tsconfig.json` and no `jsconfig.json`, the type generator
is skipped entirely — zero overhead.
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

When a package declares sub-path modules, Meteor generates a separate
`.d.ts` file for each sub-path inside the package's directory (e.g.
`packages/react-meteor-data/suspense.d.ts`) and adds the corresponding
`/// <reference>` entry to `packages.d.ts` automatically. Each sub-path file
wraps its exports in a `declare module 'meteor/pkg/sub-path'` block.

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

## Migrating from `zodern:types`

If your project currently uses the `zodern:types` package, you can remove it
once you have updated your `tsconfig.json`:

```bash
meteor remove zodern:types
```

Then update the `paths` entry as described in [Setup](#setup) above and run
`meteor types` once to regenerate the types. `meteor run`, `meteor build`, and
`meteor lint` also regenerate them as part of their existing build pipeline.
The output format is compatible: Meteor's native generator produces the same
`declare module 'meteor/…'` structure that `zodern:types` produced.
