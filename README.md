# Meteor Guide

[![Articles drafted](https://badge.waffle.io/meteor/guide.svg?label=status:%20first%20draft&title=Articles%20Drafted)](https://waffle.io/meteor/guide?label=article)

- See the example app we're working to embody the principles from the guide at [meteor/todos](https://github.com/meteor/todos)
- Check out the [outlines and discussions](https://github.com/meteor/guide/labels/article)
- Check out the [live site](http://guide.meteor.com/)

## Contributing

If you're interested in helping out, the best thing to do is to look at the [GitHub issues which represent the guide articles](https://github.com/meteor/guide/labels/article). If any topics interest you, read the outlines and major decision points linked from the issue, and post comments or PRs offering suggestions!

### Writing tips

Things to be aware of:

#### Always use specific IDs on headers so that we can change them later:

```
// bad
## Using schemas with collections

// good
<h2 id="schemas-with-collections">Using schemas with collections</h2>
```

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

## Changelog

- 2016/04/01: Changed Mocha test code snippets to use function expressions instead of arrow functions, after the discussion on [Issue #318](https://github.com/meteor/guide/issues/318). [PR #323](https://github.com/meteor/guide/pull/323)
- 2016/04/01: Added `gadicc:blaze-react-component` in a new "Blaze in React" section of the React article. [PR #325](https://github.com/meteor/guide/pull/325)
- 2016/05/31: Added Chromatic demo video and React Storybook to User Interfaces article. [PR #320](https://github.com/meteor/guide/pull/320)

Changelog is only tracked since the Meteor 1.3 release.
