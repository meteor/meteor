---
title: Contribution Guidelines
order: 1000
description: Tips for contributing to the Meteor Guide.
---

Please submit clarifications and improvements to the Guide! If it's just a small fix, go ahead and open a PR. If it's something more major, please file an issue for discussion first.

### Using the change log

If you are adding significant new content, please take a moment to include an update to the [changelog](CHANGELOG.md) in your PR.

### Writing tips

Things to be aware of:

#### Always use specific IDs on headers so that we can change them later:

```
// bad
## Using schemas with collections

// good
<h2 id="schemas-with-collections">Using schemas with collections</h2>
```

#### Titles and headers

Article titles are `Title Case`, and headers are `Sentence case`.

#### Always put a blank line after each header

Otherwise, the following paragraph isn't parsed correctly.

```
// bad
<h2 id="schemas-with-collections">Using schemas with collections</h2>
This is some text

// good
<h2 id="schemas-with-collections">Using schemas with collections</h2>

This is some text
```

#### Escape handlebars syntax inside inline code snippets

Note: you don't need to escape things in fenced/multiline code snippets, only in inline ones.

```
// will break
Render multiple items in your template with `{{#each}}`

// good
Render multiple items in your template with `{% raw %}{{#each}}{% endraw %}`
```

### Running the static site generator locally

The site is built using hexo, a static site generator. You'll need to `npm install -g hexo-cli`, then

```
git submodule update --init --recursive
cd site
npm install
hexo server
```
