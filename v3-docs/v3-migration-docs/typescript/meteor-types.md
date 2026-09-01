# Types for Meteor 3

Meteor 3.6 adds an opt-in generator for installed packages that publish
TypeScript information. It does not silently replace an existing provider:

- Ordinary `run`, `build`, `test`, and `lint` commands do not generate native
  declarations.
- A directly installed `zodern:types` package remains active, and
  `meteor types` skips without changing either provider tree.
- Native declarations are selected only after the application removes
  `zodern:types`, runs `meteor types`, updates its configuration, and stops
  loading `@types/meteor`.

First remove the direct legacy provider and generate native declarations. If
generation fails, Meteor preserves the old output so you can re-add the
package and roll back without changing `tsconfig.json`:

```bash
meteor remove zodern:types # only if it is installed directly
meteor types
```

After generation succeeds, add the following entries to the application's
`tsconfig.json`:

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
  }
}
```

Then remove a directly installed `@types/meteor` package:

```bash
meteor npm uninstall @types/meteor
```

Also check every `tsconfig.json` used by the application, including extended
configurations. If `compilerOptions.types` contains `"meteor"`, remove that
entry so the old ambient provider is not loaded alongside the native one.

If the project already defines `files` or `include`, append the generated
barrel and retain the existing source patterns. Do not point `meteor/*`
directly at `packages.d.ts`; the barrel supplies ambient scoped and sub-path
modules, while `packages/*` contains normal per-package adapters.

Use the application's locally installed `typescript` dependency for the check.
If the project does not have one, add and pin a compatible version without
coupling a compiler upgrade to this provider migration. For example, add a
package script:

```json [package.json]
{
  "scripts": {
    "check-types": "meteor types && tsc --noEmit"
  }
}
```

Then check the application through the local compiler:

```bash
meteor npm run check-types
```

The generated declarations live under `.meteor/types/` and remain untracked.
If the corrected native declarations reveal application errors, fix them or
restore the previous legacy dependencies and TypeScript configuration; the
provider change is independent from the Meteor 3.6 runtime upgrade.

See [TypeScript Types for Meteor Packages](https://docs.meteor.com/cli/using-core-types)
for provider selection, JavaScript IntelliSense, CI, rollback, and
troubleshooting.

::: tip Older Meteor 3 releases
On Meteor 3 versions that do not yet include the native type generator, add the community [`zodern:types`](https://github.com/zodern/meteor-types) package instead:

```bash
meteor add zodern:types
```

and point `paths` at `.meteor/local/types/packages.d.ts` (the folder
`zodern:types` generates), with `"preserveSymlinks": true` in your
`compilerOptions`.
:::
