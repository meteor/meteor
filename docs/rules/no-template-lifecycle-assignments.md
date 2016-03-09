#  Prevent deprecated template lifecycle callback assignments (no-template-lifecycle-assignments)

Assigning lifecycle callbacks to template properties has been deprecated in favor of the more robust template lifecycle callback registration functions.

> Add `onRendered`, `onCreated`, and `onDestroyed` methods to Template. Assignments to `Template.foo.rendered` and so forth are deprecated but are still supported for backwards compatibility. -
>
> Source: [Meteor Release History](https://github.com/meteor/meteor/blob/devel/History.md#blaze-2)

## Rule Details

This rule aims to ensure you are not using deprecated functions to register lifecycle callbacks to templates.

The following patterns are considered warnings:

```js

Template.foo.created = function { /* .. */ }
Template.foo.rendered = function { /* .. */ }
Template.foo.destroyed = function { /* .. */ }

Template[bar].created = function { /* .. */ }
Template[bar].rendered = function { /* .. */ }
Template[bar].destroyed = function { /* .. */ }


```

The following patterns are not warnings:

```js

Template.foo.onCreated(function { /* .. */ })
Template.foo.onRendered(function { /* .. */ })
Template.foo.ondestroyed(function { /* .. */ })

Template[foo].onCreated(function { /* .. */ })
Template[foo].onRendered(function { /* .. */ })
Template[foo].ondestroyed(function { /* .. */ })

```

## When Not To Use It

This rule should not be used with Meteor below v1.0.4.

## Further Reading

* https://github.com/meteor/meteor/blob/devel/History.md#v104-2015-mar-17
