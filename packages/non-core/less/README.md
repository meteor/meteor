# Less
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/less) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/less)
***

The Less package provides a compiler build plugin for the Meteor build tool. It
handles the compilation of `*.less` files to CSS.

## Usage

If you want to use it in your app, just run:

```bash
meteor add less
```

If you want to use it for your package, add it in your package control file's
`onUse` block:

```javascript
Package.onUse(function (api) {
  ...
  api.use('less');
  ...
});
```

## File types

There are two different types of files recognized by this package:

- Less sources (all `*.less` files that are not imports)
- Less imports:
  * files with the `import.less` extension: `*.import.less`
  * files in an `imports` directory: `**/imports/**/*.less`
  * marked as `isImport: true` in the package's `package.js` file:
    `api.addFiles('x.less', 'client', {isImport: true})`

The source files are compiled automatically. The imports are not loaded by
themselves; you need to import them from one of the source files to use them.

The imports are intended to keep shared mixins and variables for your project,
or to allow your package to provide several components which your package's
users can opt into one by one.

Each compiled source file produces a separate CSS file.  (The
`standard-minifier-css` package merges them into one file afterwards.)

## Importing

You can use the regular `@import` syntax to import any Less files: sources or
imports.

Besides the usual way of importing files based on the relative path in the same
package (or app), you can also import files from other packages or apps with the
following syntax.

Importing styles from a different package:

```less
@import "{my-package:pretty-buttons}/buttons/styles.import.less"

.my-button {
  // use the styles imported from a package
  .pretty-button;
}
```

Importing styles from the target app:

```less
@import "{}/client/styles/imports/colors.less"

.my-nav {
  // use a color from the app style pallete
  background-color: @primary-branding-color;
}
```

Importing styles relative to the current package/app's root:

```less
@import "/path/to/style.import.less";
```
