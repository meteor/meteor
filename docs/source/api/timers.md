---
title: Timers
description: Documentation of Meteor's timeout APIs.
---

Meteor uses global environment variables
to keep track of things like the current request's user.  To make sure
these variables have the right values, you need to use
`Meteor.setTimeout` instead of `setTimeout` and `Meteor.setInterval`
instead of `setInterval`.

These functions work just like their native JavaScript equivalents.
If you call the native function, you'll get an error stating that Meteor
code must always run within a Fiber, and advising to use
`Meteor.bindEnvironment`.

{% apibox "Meteor.setTimeout" %}

Returns a handle that can be used by `Meteor.clearTimeout`.

{% apibox "Meteor.setInterval" %}

Returns a handle that can be used by `Meteor.clearInterval`.

{% apibox "Meteor.clearTimeout" %}
{% apibox "Meteor.clearInterval" %}
