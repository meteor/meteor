# Markdown

> Note: This package has been deprecated.

This package lets you use Markdown in your templates.

### Installation

```sh
meteor add markdown
```

### Usage

This package is lazy loaded. Is is not added into the initial Bundle.
So you need to import it in your template.

```js
// myTemplate.js
import 'meteor/markdown';
```

Then you can use the `markdown` helper in your templates:

```html
<!-- myTemplate.html -->
{{#markdown}}I am using __markdown__.{{/markdown}}
```

outputs

```html
<p>I am using <strong>markdown</strong>.</p>
```
