# stylus
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/stylus) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/stylus)
***

**DEPRECATED:** This package is no longer supported/maintained as part of the
Meteor project. To continue using the last supported version of this package,
pin your package version to 2.513.13 (`meteor add stylus@=2.513.13`).

[Stylus](http://learnboost.github.com/stylus/) is a CSS pre-processor with a
simple syntax and expressive dynamic behavior. It allows for more compact
stylesheets and helps reduce code duplication in CSS files.

With the `stylus` package installed, files with the `.styl` extension are sent
through the `stylus` CSS pre-processor and the results are included in the
client CSS bundle.

The `stylus` package also includes `nib` support. Add `@import 'nib'` to any
`*.styl` file to enable cross-browser mixins such as `linear-gradient` and
`border-radius`.

If you want to `@import` a file, give it the extension `.import.styl`
to prevent Meteor from processing it independently.

See <http://tj.github.io/nib/> for documentation of the nib extensions of Stylus.


## Usage

The package processes all `.styl` files, treating `.styl` as entry points
and all files with extension `.import.styl` or a file in under an `imports`
folder as an import.

Also, if a file is added in a package, a special `isImport: true` option can be
passed to mark it as an import: `api.add('styles.styl', 'client', {isImport: true})`.

Example:

A component stylus file, importable, but not an entry-point:

```stylus
// app/components/my-component/styles.import.styl
$primary-color = #A7A7A7
.my-component
  input
    border 1px solid
  textarea
    color $primary-color
```

The main app entry point for the styles, `app.styl`:

```stylus
// app/app.styl
@import './components/my-component/styles.import'

// ... rest of app styles
```


## Cross-packages imports

This package allows apps to import Stylus styles from packages and vice-versa.
The import syntax from importing files from other packages is curly braces:

```javasciprt
// in procoder:fancy-buttons package's package.js file
...
api.add('styles/buttons.styl', 'client', {isImport: true});
...
```

```stylus
// app.styl
// import styles from a package
@import '{procoder:fancy-buttons}/styles/buttons.styl'

// use imported styles in our code
.my-buttons
  @extend .fancy-buttons
  color: white
```

To import a file from the app, leave the content of curly braces empty:

```stylus
// packages/my-package/generic-buttons.styl
// import the base styles from app
@import '{}/client/imports/colors.styl'

// use the colors from app in this component
.generic-buttons
  background-color: $app-base-color
```


## Limitations

Since this package uses custom code for `@import`s, some of the import syntax is
not supported at the moment:

- globbing: `@import './folder/*'`
- importing `index.styl`: `@import ./folder/` - should automatically load
  `./folder/index.styl`
