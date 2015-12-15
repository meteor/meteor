# Meteor Guide

[![Articles drafted](https://badge.waffle.io/meteor/guide.svg?label=status:%20first%20draft&title=Articles%20Drafted)](https://waffle.io/meteor/guide?label=article)

We're tracking [our progress](https://waffle.io/meteor/guide?label=article) using Waffle.io.

- See the example app we're working to embody the principles from the guide at [meteor/todos](https://github.com/meteor/todos)
- Check out the [outlines and discussions](https://github.com/meteor/guide/labels/article)
- Checkout the [live site](http://guide.meteor.com/) [Still in progress!]

### How to contribute

If you're interested in helping out, the best thing to do is to look at the [GitHub issues which represent the 16 guide articles](https://github.com/meteor/guide/labels/article). If any topics interest you, read the outlines and major decision points linked from the issue, and post comments or PRs offering suggestions!

--------

Current goals:

1. Get feedback internally at MDG about the article outlines and polish them up
2. Pump out some rough drafts of articles as fast as we can
3. Get the guide website up and running

We're building a Meteor Guide. Like the [Rails Guide](http://guides.rubyonrails.org/), but for Meteor. We're going to do this totally out in the open, and we can't do it without the community.

Read more in the [interview on the Meteor Blog](http://info.meteor.com/blog/meteor-guide-interview).

1. Read the [charter](charter.md) and [proposed outlines for guide articles](outlines.md)
2. Submit pull requests on the outlines to add things that are missing
3. File issues for discussion
4. Follow along with progress on each guide article [on Waffle.io](https://waffle.io/meteor/guide?label=article)

### MDG

1. See the [standup notes and planning](meeting-notes.md)
2. See the [code action items](https://github.com/meteor/guide/labels/code)
3. See the [static site shell readme](site/README.md)

### Writing tips

Things to be aware of:

#### Always use specific IDs on headers so that we can change them later:

```
// bad
## Using schemas with collections

// good
<h2 id="schemas-with-collections">Using schemas with collections</h2>
```

#### Escape handlebars syntax inside inline code snippets

```
// will break
Render multiple items in your template with `{{#each}}`

// good
Render multiple items in your template with `{% raw %}{{#each}}{% endraw %}}`
```
