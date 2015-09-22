# caching-html-compiler

Provides a pluggable class used to compile HTML-style templates in Meteor build plugins. This abstracts out a lot of the functionality you would need to implement the following plugins:

1. `templating`
2. `static-html`
3. `simple:markdown-templating`

It provides automatic caching and handles communicating with the build plugin APIs. The actual functions that convert HTML into compiled form are passed in as arguments into the constructor, allowing those functions to be unit tested separately from the caching and file system functionality.

-------

### new CachingHtmlCompiler(name, tagScannerFunc, tagHandlerFunc)

Constructs a new CachingHtmlCompiler that can be passed into `Plugin.registerCompiler`.

#### Arguments

1. `name` The name of the compiler, used when printing errors. Should probably be the same as the name of the build plugin and package it is used in.
2. `tagScannerFunc` A function that takes a string representing a template file as input, and returns an array of Tag objects. See the README for `templating-tools` for more information about the Tag object.
3. `tagHandlerFunc` A function that takes an array of Tag objects (the output of the previous argument) and returns an object with `js`, `body`, `head`, and `bodyAttr` properties, which will be added to the app through the build plugin API.

#### Example

Here is some example code from the `templating` package:

```js
Plugin.registerCompiler({
  extensions: ['html'],
  archMatching: 'web',
  isTemplate: true
}, () => new CachingHtmlCompiler(
  "templating",
  TemplatingTools.scanHtmlForTags,
  TemplatingTools.compileTagsWithSpacebars
));
```
