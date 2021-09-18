# Forbid DOM lookup in template creation callback (no-dom-lookup-on-created)

When the `onCreated` lifecycle callback is called, the template does not yet exist in the DOM. Trying to access its elements is most likely an error.


## Rule Details

This rule aims to prevent accessing a templates elements before they are attached to the DOM.

The following patterns are considered warnings:

```js

Template.foo.onCreated(function () {
  $('.bar').focus()
})

Template.foo.onCreated(function () {
  Template.instance().$('.bar').focus()
})

```

The following patterns are not warnings:

```js

Template.foo.onCreated(function () {
  console.log('hello')
})


Template.foo.onRendered(function () {
  $('.bar').focus()
  Template.instance().$('.bar').focus()
})

// should be a warning, but is too hard to check for statically,
// so the rule ignores it
Template.foo.onCreated(function () {
  this.$('.bar').focus()
})

```

## Limitations
The rule can not warn when jQuery is invoked through the context.

## Further Reading

- http://docs.meteor.com/#/full/template_onCreated
