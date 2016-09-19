---
title: markdown
description: Documentation of Meteor's `markdown` package.
---

This package lets you use Markdown in your templates. It's easy: just
put your markdown inside `{% raw %}{{#markdown}} ... {{/markdown}}{% endraw %}`
tags. You can still use all of the usual Meteor template features
inside a Markdown block, such as `{% raw %}{{#each}}{% endraw %}`, and you still get
reactivity.

Example:

```html
{{#markdown}}I am using __markdown__.{{/markdown}}
```

outputs

```html
<p>I am using <strong>markdown</strong>.</p>
```
