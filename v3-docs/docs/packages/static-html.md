# static-html

`static-html` is a build plugin that lets you define static page content in `.html` files. It is an alternative to the `templating` package that does **not** compile Blaze templates — useful when you use React, Angular, Solid, or another view layer and just want some static HTML on the page to render into.

```bash
meteor add static-html
```

## How it works

The plugin parses all of the `.html` files in your app and looks for top-level tags:

- `<head>` — its contents are appended to the `head` section of the generated HTML.
- `<body>` — its contents are appended to the `body` section of the generated HTML.

Attributes are supported on the `<body>` tag, but **not** on `<head>`. Body attributes are compiled to code that runs via `Meteor.startup`.

### Example

```html
<!-- main.html -->
<head>
  <title>My App</title>
</head>

<body>
  <div id="root"></div>
</body>
```

Your view framework can then render into the `#root` element.

## Notes

- This package is a build-time plugin (it is `devOnly`); it registers a compiler that processes `.html` files at build time. There is no runtime JavaScript API to call.
- Use `static-html` **instead of** `templating` when you do not need Blaze. The two compile the same `.html` files differently, so an app typically uses one or the other.

> Documented from `packages/static-html/package.js` (build-plugin registration, `devOnly`, the `meteor` client implication for body attributes) and `packages/static-html/README.md` (the `<head>`/`<body>` parsing behavior and attribute support).
