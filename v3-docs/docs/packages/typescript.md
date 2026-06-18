# TypeScript

The `typescript` package lets you write [TypeScript](https://www.typescriptlang.org)
modules with `.ts` and `.tsx` file extensions in your Meteor apps and
packages, alongside regular `.js` files. By default, this package is
pre-installed in the `.meteor/packages` file of all new apps, so most
projects can start writing TypeScript with no extra setup.

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
- **Per-module compilation.** Modules are compiled individually with
  TypeScript's `transpileModule`, so features that need cross-file
  analysis are limited. In particular, `export const enum { … }` is not
  fully supported, though a plain `const enum { … }` works when confined to
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
[React Fast Refresh](/packages/react-meteor-data), so editing a React
component updates it in place without a full page reload or losing
component state.
