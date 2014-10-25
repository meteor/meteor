{{#template name="basicSession"}}

<h2 id="session"><span>Session</span></h2>

`Session` provides a global object on the client that you can use to
store an arbitrary set of key-value pairs. Use it to store things like
the currently selected item in a list.

What's special about `Session` is that it's _reactive_. If you call
`Session.get("myKey")` in a [template helper](#template_helpers) or inside
[`Tracker.autorun`](#tracker_autorun), the relevant part of the template will
be re-rendered automatically whenever `Session.set("myKey", newValue)` is
called.

{{> autoApiBox "Session.set"}}
<!-- XXX The Session.set API box is a little wonky -->

{{> autoApiBox "Session.get"}}

Example:

```
<!-- In your template -->
<template name="main">
  <p>We've always been at war with {{dstache}}theEnemy}}.</p>
</template>
```

```
// In your JavaScript
Template.main.helpers({
  theEnemy: function () {
    return Session.get("enemy");
  }
});

Session.set("enemy", "Eastasia");
// Page will say "We've always been at war with Eastasia"

Session.set("enemy", "Eurasia");
// Page will change to say "We've always been at war with Eurasia"
```

Using `Session` gives us our first taste of _reactivity_, the idea that the view
should update automatically when necessary, without us having to call a `render`
function manually. In the next section, we will learn how to use Tracker, the
lightweight library that makes this possible in Meteor.

{{/template}}
