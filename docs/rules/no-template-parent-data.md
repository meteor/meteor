# Avoid accessing template parent data (no-template-parent-data)

When making children aware of their parents data context, they are tightly integrated and hard to reuse.
Changing the parent can lead to unintended errors in the child.
Passing down the properties explicitly avoids this issue.


## Rule Details

This rule aims to ensure child components are unaware of their parents.

The following patterns are considered warnings:

```js

Template.parentData()
Template.parentData(0)
Template.parentData(1)
Template.parentData(foo)

```

The following patterns are not warnings:

```js

Template.currentData()

```

## Further Reading

- http://docs.meteor.com/#/full/template_parentdata
