# TypeScript

The `typescript` package lets you write [TypeScript](https://www.typescriptlang.org)
modules with `.ts` and `.tsx` file extensions in your Meteor apps and
packages, alongside regular `.js` files. It registers a compiler plugin in
Meteor's classic build stack and is what compiles TypeScript in
TypeScript-enabled Atmosphere packages and in apps built with that stack. By
default, it is listed in the `.meteor/packages` file of new apps, so most
projects can start writing TypeScript with no extra setup.

> [!NOTE]
> This page describes the classic (isobuild) build stack. Apps using the
> modern build stack bundle with [Rspack](https://rspack.dev), and this
> package's compiler plugin is bypassed for app source. The type-checking
> notes below still apply, since neither stack type-checks at build time.

## Usage

The `typescript` package registers a compiler plugin that transpiles
TypeScript to plain ECMAScript for each of Meteor's build targets
(server, modern browsers, legacy browsers, and Cordova). By default,
`.ts`/`.tsx` files are transpiled with [SWC](https://swc.rs)
(`@meteorjs/swc-core`), the modern transpiler introduced in Meteor 3.3:
new apps enable it via `"meteor": { "modern": true }` in `package.json`,
and since Meteor 3.5.1 it defaults on even when `package.json` has no
`meteor.modern` setting.

The previous pipeline — the official TypeScript compiler
(`transpileModule`) followed by [Babel](https://babeljs.io/) — is used
only when the modern transpiler is turned off (`"meteor": { "modern": false }`
or `"meteor": { "modern": { "transpiler": false } }`), when a file or
package is excluded via the transpiler's exclude options (`excludeApp`,
`excludePackages`, `excludeNodeModules`, `excludeLegacy`), or as an
automatic per-file fallback when SWC fails to compile a file. When that
pipeline is active, the TypeScript compiler runs before Babel, so it
does not suffer from the
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

Run type checking as a separate step. Most editors (such as VS Code)
report type errors as you work, and you can check the whole project from
the command line with the TypeScript compiler in `--noEmit` mode:

```bash
meteor npm install --save-dev typescript
meteor npx tsc --noEmit
```

::: tip
Add a script to your `package.json` so type checking is easy to run in CI
or locally:

```json [package.json]
{
  "scripts": {
    "check-types": "tsc --noEmit",
    "check-types:watch": "tsc --noEmit --watch"
  }
}
```
:::

To get types for Meteor core packages (`meteor/meteor`, `meteor/mongo`, …)
working in your editor, add the community [`zodern:types`](https://github.com/zodern/meteor-types)
package:

```bash
meteor add zodern:types
```

For a full walkthrough of enabling core-package types — including the
`tsconfig.json` `paths` setup and running `meteor lint` to generate the
type definitions — see the [Using core types](/cli/using-core-types) guide.

## `tsconfig.json`

The plugin **ignores `tsconfig.json`** when compiling — compilation
options are kept intentionally simple. You should still keep a
`tsconfig.json` in your project root to configure your editor and the
standalone `tsc` type checker. A typical starting point that also wires up
Meteor core-package types (via `zodern:types`) looks like:

```json [tsconfig.json]
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "preserveSymlinks": true,
    "paths": {
      "meteor/*": [".meteor/local/types/packages.d.ts"]
    }
  }
}
```

## Supported features and limitations

Almost all TypeScript syntax is supported. A few limitations are worth
knowing about:

- **No type checking during build** — see [Type checking](#type-checking)
  above.
- **Per-module compilation.** Modules are compiled individually — by SWC,
  or by TypeScript's `transpileModule` when the modern transpiler is
  turned off — so features that need cross-file analysis are limited. In
  particular, `export const enum Status { … }` is not
  fully supported, though a plain `const enum Status { … }` works when confined to
  a single module. If you need whole-program compilation, consider the
  [`adornis:typescript`](https://atmospherejs.com/adornis/typescript)
  community package.
- **`.d.ts` files are not compiled.** Declaration files are detected and
  skipped, so they will not cause build errors.
- **TypeScript parses first (TypeScript-then-Babel pipeline).** When the
  modern transpiler is turned off, the TypeScript compiler runs before
  Babel, so syntax that TypeScript doesn't understand (such as experimental
  ECMAScript proposals) will be rejected even if Babel could handle it. You
  can use `.babelrc` files to configure Babel, but TypeScript still has to
  accept the code first.

## React and `.tsx`

`.tsx` files are supported out of the box. When [Hot Module Replacement](/packages/hot-module-replacement)
is enabled (it is in new apps), the `typescript` package also enables
[React Fast Refresh](/packages/hot-module-replacement), so editing a React
component updates it in place without a full-page reload or losing
component state.
