# html-scanner

## `scanHtmlForTags(options)`

Scan an HTML file for top-level tags as specified by `options.tagNames`, and
return an array of `Tag` objects.

### Options

1. `sourceName` the name of the input file, used when throwing errors.
2. `contents` the contents of the input file, these are parsed to find the
   top-level tags.
3. `tagNames` the top-level tags to look for in the HTML.

### Example

```js
const tags = scanHtmlForTags({
  sourceName: inputPath,
  contents: contents,
  tagNames: ["body", "head", "template"]
});
```

### Tag object

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
