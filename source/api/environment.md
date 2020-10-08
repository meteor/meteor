---
title: Environment
description: Documentation of how to use Meteor.EnvironmentVariable
---

Meteor runs most app code within Fibers, which allows keeping track of the context it is running in. `Meteor.EnvironmentVariable` works with `Meteor.bindEnvironment`, promises, and many other Meteor API's to preserve the context in async code.

{% apibox "Meteor.EnvironmentVariable" %}

{% apibox "Meteor.EnvironmentVariable.get" %}

{% apibox "Meteor.EnvironmentVariable.withValue" %}

{% apibox "Meteor.bindEnvironment" %}
