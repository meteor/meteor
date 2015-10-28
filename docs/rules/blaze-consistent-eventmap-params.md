# Consistent event handler parameters (blaze-consistent-eventmap-params)

Force consistent event handler parameters in [event maps](http://docs.meteor.com/#/full/eventmaps)


## Rule Details

Prevent the use of differently named parameters in event handlers to achieve more consistent code

The following patterns are considered warnings:

```js
// all on the client
Template.foo.events({
  // 'foo' does not match 'event'
  'submit form': function (foo) {}
})

Template.foo.events({
  // 'bar' does not match 'templateInstance'
  'submit form': function (event, bar) {}
})

Template.foo.events({
  // neither 'foo' nor 'bar' are correct
  'submit form': function (foo, bar) {}
})

```

The following patterns are not warnings:

```js
// on the client
Template.foo.events({
  'submit form': function (event) {}
})

// on the client
Template.foo.events({
  'submit form': function (event, templateInstance) {}
})

```

### Options

You can optionally set the names of the parameters.  
You can set the name of the event parameter using `eventParamName` and the name of the template-instance parameterusing `templateInstanceParamName`.  
Here are examples of how to do this:

```js
/*
 eslint meteor/blaze-consistent-eventmap-params: [2, {"eventParamName": "evt"}]
 */
Template.foo.events({
  'submit form': function (evt) {}
})

/*
 eslint meteor/blaze-consistent-eventmap-params: [2, {"templateInstanceParamName": "tmplInst"}]
 */
Template.foo.events({
  'submit form': function (event, tmplInst) {}
})

/*
 eslint meteor/blaze-consistent-eventmap-params: [2, {"eventParamName": "evt", "templateInstanceParamName": "tmplInst"}]
 */
Template.foo.events({
  'submit form': function (evt, tmplInst) {}
})

```

## Limitations

Checks client-side only.  
If you use an event map in a universal file (server and client) then the `Meteor.isClient` checks must happen in `if`-conditions with exactly one condition.

## Further Reading

* http://docs.meteor.com/#/full/eventmaps
