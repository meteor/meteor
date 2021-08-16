---
title: markdown
description: Documentation of Meteor's `markdown` package.
---

> Note: This package has been deprecated.

This package lets you use Markdown in your templates.

### Installation
`meteor add markdown`

### Usage 
This package is lazy loaded. Is is not added into the initial Bundle.
So you need to import it in your template.
```
// myTemplate.js
import 'meteor/markdown';
```

Then just put your markdown inside `{% raw %}{{#markdown}} ... {{/markdown}}{% endraw %}`
tags. You can still use all of the usual Meteor template features
inside a Markdown block, such as `{% raw %}{{#each}}{% endraw %}`, and you still get
reactivity.

Example:

```html
<!-- myTemplate.html -->
{{#markdown}}I am using __markdown__.{{/markdown}}
```

outputs

```html
<p>I am using <strong>markdown</strong>.</p>
```
