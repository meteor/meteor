# Scope DOM lookups to the template instance (scope-dom-lookups)

> It’s a bad idea to look up things directly in the DOM with jQuery’s global `$()`. It’s easy to select some element on the page that has nothing to do with the current component. Also, it limits your options on rendering outside of the main document. - [source](http://guide.meteor.com/blaze.html#scope-dom-lookups-to-instance)


## Rule Details

This rule aims to ensure DOM lookups are scoped to the template instance to improve performance and to reduce accidental side-effects.

The following patterns are considered warnings:

```js

Template.foo.onRendered(function () {
  $('.bar').focus()
})

Template.foo.onRendered(function () {
  const $bar = $('.bar')
  // ..
})

Template.foo.events({
  'click .bar': function (event, instance) {
    $('.baz').focus()
  }
})

Template.foo.helpers({
  'bar': function () {
    $('.baz').focus()
  }
})

Template.foo.onDestroyed(function () {
  $('.bar').focus()
})

Template.foo.onRendered(function () {
  jQuery('.bar').focus()
})

```

The following patterns are not warnings:

```js

Template.foo.onRendered(function () {
  this.$('.bar').focus()
})

Template.foo.onRendered(function () {
  Template.instance().$('.bar').focus()
})

Template.foo.events({
  'click .bar': function (event, instance) {
    instance.$('.baz').focus()
  }
})

```

## When Not To Use It

Disable this rule for specific lines if something outside of the template needs to be looked up and there is no way around it.

## Further Reading

- http://guide.meteor.com/blaze.html#scope-dom-lookups-to-instance
