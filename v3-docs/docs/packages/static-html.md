# static-html

`static-html` is a build plugin that lets you define static page content in `.html` files. It is an alternative to the `templating` package that does **not** compile Blaze templates — useful when you use React, Angular, Solid, or another view layer and just want some static HTML on the page to render into.

```bash
meteor add static-html
```

## Usage

**Adding the package is all you need to do — there is nothing to configure.** `static-html` exposes no JavaScript API and reads no settings. Once installed, it automatically processes every `.html` file in your app at build time (see [How it works](#how-it-works) and the example below); you just write the `.html` files. The only practical consideration is that `static-html` and `templating` compile the same `.html` files differently, so an app uses one or the other — not both.

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

## Using it with a view framework

The usual reason to use `static-html` is to provide a mount point for a client-side framework. Define an empty root element in a `.html` file (as in the example above), then render into it from your JavaScript/JSX:

First install your framework (`meteor npm install react react-dom`). Meteor auto-loads `client/main.jsx` (and other eager files outside `imports/`) as the client entry point.

```jsx
// client/main.jsx (React example)
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  const root = createRoot(document.getElementById('root'));
  root.render(<h1>Hello from React</h1>);
});
```

The same pattern works for Vue, Svelte, Solid, or any framework — `static-html` just gets the `#root` element onto the page and your framework takes over from there.

### Body attributes

Attributes on the `<body>` tag are supported (and applied at startup via `Meteor.startup`):

```html
<body class="my-app" data-theme="dark">
  <div id="root"></div>
</body>
```

Attributes on `<head>` are **not** supported.

## Notes

- This package is a build-time plugin (it is `devOnly`); it registers a compiler that processes `.html` files at build time. There is no runtime JavaScript API to call.
- Use `static-html` **instead of** `templating` when you do not need Blaze. The two compile the same `.html` files differently, so an app typically uses one or the other.

> Documented from `packages/static-html/package.js` (build-plugin registration, `devOnly`, the `meteor` client implication for body attributes) and `packages/static-html/README.md` (the `<head>`/`<body>` parsing behavior and attribute support).
