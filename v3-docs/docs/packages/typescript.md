# TypeScript

The `typescript` package lets you write [TypeScript](https://www.typescriptlang.org)
modules with `.ts` and `.tsx` file extensions alongside regular `.js` files.
It transpiles TypeScript syntax in Meteor's classic build stack; type-checking
and Meteor package declarations are separate concerns. By default, the package
is listed in `.meteor/packages` for new apps.

> [!NOTE]
> This page describes the classic (isobuild) build stack. Apps using the
> [modern build stack](/about/modern-build-stack/rspack-bundler-integration)
> transpile application `.ts` and `.tsx` files with SWC through Rspack, so this
> package's compiler plugin is bypassed for application source. Atmosphere
> packages can still use the compiler plugin. Neither stack type-checks your
> application as part of transpilation.

## Usage

The `typescript` package registers a compiler plugin that transpiles
TypeScript to plain ECMAScript, which is then compiled by [Babel](https://babeljs.io/)
for each of Meteor's build targets (server, modern browsers, legacy
browsers, and Cordova). Because the official TypeScript compiler runs
before Babel, this plugin does not suffer from the
[caveats](https://babeljs.io/docs/babel-plugin-transform-typescript#caveats)
that affect Babel's standalone TypeScript transform — for example,
`namespace` declarations are fully supported.

To add this package to an existing app, run the following command from
your app directory:

```bash
meteor add typescript
```

To add the `typescript` package to an existing package, include the
statement `api.use('typescript');` in the `Package.onUse` callback in your
`package.js` file:

```js
Package.onUse((api) => {
  api.use('typescript');
});
```

Like [`ecmascript`](/packages/ecmascript), this package implies
[`modules`](/packages/modules), `ecmascript-runtime`, `babel-runtime`,
`promise`, and [`dynamic-import`](/packages/dynamic-import), so your
`.ts`/`.tsx` files also get the full set of ES2015+ syntax features,
polyfills (`Promise`, `Map`, `Set`, `Symbol`, …), and `import`/`export`
support — there is no need to add `ecmascript` separately.

## Type checking

::: warning
The `typescript` package **compiles** your code but does **not type-check**
it. Your build (and your app) will succeed even if there are type errors —
TypeScript types are stripped, not verified, during the build.
:::

Run type checking as a separate step with the application's local TypeScript
compiler. New TypeScript templates already include `typescript` in
`devDependencies`. For an existing app, install and pin a version compatible
with the project instead of changing compiler versions as part of a declaration
provider migration.

Add a script to `package.json` so local and CI checks resolve `tsc` from the
application's `node_modules`:

```json [package.json]
{
  "scripts": {
    "check-types": "tsc --noEmit",
    "check-types:watch": "tsc --noEmit --watch"
  }
}
```

```bash
meteor npm run check-types
```

Before running `tsc`, configure a declaration provider for imports such as
`meteor/meteor` and `meteor/mongo`. Meteor 3.6 preserves existing
`@types/meteor` and `zodern:types` configurations. To use the native provider,
configure it explicitly and run `meteor types` before `tsc`; ordinary build
commands do not write `.meteor/types/`.

For a full walkthrough of enabling core-package types — including the
`tsconfig.json` `paths` setup and the `meteor types` command — see the
[Using core types](/cli/using-core-types) guide.

## `tsconfig.json`

The classic compiler plugin **ignores `tsconfig.json`** when transpiling files;
its compilation options are intentionally limited. You should still keep a
`tsconfig.json` in the project root to configure your editor and standalone
`tsc` checks.

For an app that has explicitly selected Meteor's native declaration provider,
the relevant part of the configuration looks like this:

```json [tsconfig.json]
{
  "files": ["./.meteor/types/packages.d.ts"],
  "include": ["**/*.ts", "**/*.tsx"],
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "baseUrl": ".",
    "skipLibCheck": true,
    "paths": {
      "meteor/*": ["./.meteor/types/packages/*"]
    }
  }
}
```

Run `meteor types` before `tsc`. If the project already defines `files` or
`include`, append the generated barrel and keep the existing source patterns.
See [TypeScript Types for Meteor Packages](/cli/using-core-types) before
changing providers in an existing Meteor 3.6 application.

## Supported features and limitations

Almost all TypeScript syntax is supported. A few limitations are worth
knowing about:

- **No type checking during build** — see [Type checking](#type-checking)
  above.
- **Per-module compilation.** Modules are compiled individually with
  TypeScript's `transpileModule`, so features that need cross-file
  analysis are limited. In particular, `export const enum Status { … }` is not
  fully supported, though a plain `const enum Status { … }` works when confined to
  a single module. If you need whole-program compilation, consider the
  [`adornis:typescript`](https://atmospherejs.com/adornis/typescript)
  community package.
- **`.d.ts` files are not compiled.** Declaration files are detected and
  skipped, so they will not cause build errors.
- **TypeScript parses first.** Because the TypeScript compiler runs before
  Babel, syntax that TypeScript doesn't understand (such as experimental
  ECMAScript proposals) will be rejected even if Babel could handle it. You
  can use `.babelrc` files to configure Babel, but TypeScript still has to
  accept the code first.

## React and `.tsx`

`.tsx` files are supported out of the box. When [Hot Module Replacement](/packages/hot-module-replacement)
is enabled (it is in new apps), the `typescript` package also enables
[React Fast Refresh](/packages/hot-module-replacement), so editing a React
component updates it in place without a full-page reload or losing
component state.
