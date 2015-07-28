# templating-tools

Has some conveniently abstracted functions that are used together with the `caching-html-compiler` package to implement different template compilers:

1. `templating`
2. `static-html`

These functions contain some code shared between the above build plugins, and if you are building your own build plugin they can be useful too. But they aren't guaranteed to be helpful for every use case, so you should carefully decide if they are appropriate for your package.

---------

### TemplatingTools.scanHtmlForTags(options)

Scan an HTML file for top-level tags as specified by `options.tagNames`, and return an array of `Tag` objects. See more about `Tag` objects below.

#### Options

1. `sourceName` the name of the input file, used when throwing errors.
2. `contents` the contents of the input file, these are parsed to find the top-level tags
3. `tagNames` the top-level tags to look for in the HTML.

#### Example

```js
const tags = scanHtmlForTags({
  sourceName: inputPath,
  contents: contents,
  tagNames: ["body", "head", "template"]
});
```

### TemplatingTools.compileTagsWithSpacebars(tags)

Transform an array of tags into a result object of the following form:

```js
{
  js: String,
  body: "",
  head: String,
  bodyAttrs: {
    [attrName]: String
  }
}
```

1. The contents of every `<template>` and `<body>` tag will be compiled into JavaScript with `spacebars-compiler`, and the code appended to the `js` field of the result.
2. The contents of every `<head>` tag will be concatenated into the `head` field of the result.
3. Any attributes found on `<body>` tags will be added to the `bodyAtts` field of the result.
4. Every `<template>` tag is required to have a `name` attribute, and no other attributes.
5. The `<head>` tag is not allowed to have any attributes.

### TemplatingTools.CompileError

This error is thrown when a compilation error happens. If you catch it, look for the following fields, which are set by `TemplatingTools.throwCompileError`:

1. `message` The error message to show to the user.
2. `file` The filename where the error occured.
3. `line` The line number where the error occured.

### TemplatingTools.throwCompileError(tag, message, [overrideIndex])

Throw a `TemplatingTools.CompileError` with the right properties. Handles generating the line number of the error for you.

#### Arguments

1. `tag` the Tag object in which this compile error occured. The fields on this object are used to populate fields on the resulting error.
2. `message` the error message, will be displayed to the user.
3. `overrideIndex` optional - if provided will be used to determine the line number of the error; otherwise the index of the start of the tag will be used.

### Tag object

The `scanHtml` and `compileTagsWithSpacebars` functions communicate via an array of Tag objects, which have the following form:

```js
{
  // Name of the tag - "body", "head", "template", etc
  tagName: String,
  
  // Attributes on the tag
  attribs: { [attrName]: String },
  
  // Contents of the tag
  contents: String,
  
  // Starting index of the opening tag in the source file
  // (used to throw informative errors)
  tagStartIndex: Number,
  
  // Starting index of the contents of the tag in the source file
  // (used to throw informative errors)
  contentsStartIndex: Number,
  
  // The contents of the entire source file, should be used only to
  // throw informative errors (for example, this can be used to
  // determine the line number for an error)
  fileContents: String,
  
  // The file name of the initial source file, used to throw errors
  sourceName: String
};
```
