# TypeScript Types for Meteor Packages

Meteor automatically generates TypeScript type declarations for all installed
packages whenever you run `meteor run` or `meteor build`. No extra packages or
manual steps are required.

## How It Works

During every build, Meteor scans the compiled packages in your project and
writes type declaration files to `.meteor/local/types/`:

```
.meteor/local/types/
├── packages.d.ts              ← single barrel file with all declare module entries
└── packages/
    ├── random.d.ts
    ├── accounts-base.d.ts
    ├── react-meteor-data.d.ts
    └── …one file per package that ships types
```

`packages.d.ts` contains `declare module 'meteor/package-name'` entries that
map every typed package to its `.d.ts` file so TypeScript can resolve imports
like:

```ts
import { Random } from "meteor/random";
import { Accounts } from "meteor/accounts-base";
```

## Setup

### New TypeScript apps

When you create a TypeScript project with `meteor create --typescript my-app`,
the generated `tsconfig.json` already has the correct `paths` configuration:

```json
{
  "compilerOptions": {
    "paths": {
      "meteor/*": [
        ".meteor/local/types/packages.d.ts",
        "node_modules/@types/meteor/*"
      ]
    }
  }
}
```

The native types take priority. `@types/meteor` remains as a fallback for
packages that have not yet bundled their own types.

### Existing TypeScript apps

Update your `tsconfig.json` `paths` entry so that `.meteor/local/types/packages.d.ts`
comes **before** `@types/meteor`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "meteor/*": [
        ".meteor/local/types/packages.d.ts",
        "node_modules/@types/meteor/*"
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

::: warning Important: `exclude` must not block `.meteor/local/types`
Do **not** add `./.meteor/**` to `exclude` — that would prevent TypeScript from
reading the generated `packages.d.ts` file. Exclude only the heavyweight isopack
cache directories as shown above.
:::

::: tip No `preserveSymlinks` needed
Older guides recommended `"preserveSymlinks": true` for `zodern:types`. This is
no longer required because the native type generator writes real files rather
than symlinks.
:::

After the first `meteor run`, TypeScript will resolve `meteor/random`,
`meteor/accounts-base`, and all other typed packages from the auto-generated
declarations.

## JavaScript Apps

JavaScript apps can get the same Meteor-import IntelliSense as TypeScript apps
by adding a `jsconfig.json` to the project root. Meteor detects **either**
`tsconfig.json` or `jsconfig.json` and generates the types accordingly.

Apps created with `meteor create` (without `--typescript`) already include a
`jsconfig.json` with the right configuration.

For existing JavaScript apps, add a `jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "/*": ["*"],
      "meteor/*": [".meteor/local/types/packages.d.ts"]
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

After the first `meteor run`, VS Code will resolve `meteor/random`,
`meteor/accounts-base`, etc. with full IntelliSense even in `.js` files.

::: tip Apps without either file
If a project has no `tsconfig.json` and no `jsconfig.json`, the type generator
is skipped entirely — zero overhead.
:::

## Sub-Path Imports

Some packages expose multiple entry points. For example,
`react-meteor-data` exposes a `suspense` sub-path:

```ts
import { useTracker } from "meteor/react-meteor-data";
import { useTracker } from "meteor/react-meteor-data/suspense";
```

When a package declares sub-path modules, Meteor generates separate
`.d.ts` files for each sub-path and adds the corresponding
`declare module 'meteor/pkg/sub-path'` entries to `packages.d.ts`
automatically.

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
`meteor run` once to regenerate the types. The output format is compatible:
Meteor's native generator produces the same `declare module 'meteor/…'` structure
that `zodern:types` produced.
