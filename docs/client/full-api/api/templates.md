{{#template name="apiTemplates"}}


<h2 id="templates_api"><span>Templates</span></h2>


When you write a template as `<{{! }}template name="foo"> ... <{{!
}}/template>` in an HTML file in your app, Meteor generates a
"template object" named `Template.foo`.

The same template may occur many times on a page, and these
occurrences are called template instances.  Template instances have a
life cycle of being created, put into the document, and later taken
out of the document and destroyed.  Meteor manages these stages for
you, including determining when a template instance has been removed
or replaced and should be cleaned up.  You can associate data with a
template instance, and you can access its DOM nodes when it is in the
document.

{{> autoApiBox "Template#events"}}

Declare event handlers for instances of this template. Multiple calls add
new event handlers in addition to the existing ones.

See [Event Maps](#eventmaps) for a detailed description of the event
map format and how event handling works in Meteor.

{{> autoApiBox "Template#helpers"}}

Each template has a local dictionary of helpers that are made available to it,
and this call specifies helpers to add to the template's dictionary.

Example:

    Template.myTemplate.helpers({
      foo: function () {
        return Session.get("foo");
      }
    });

Now you can invoke this helper with `{{dstache}}foo}}` in the template defined
with `<{{! }}template name="myTemplate">`.

Helpers can accept positional and keyword arguments:

```javascript
Template.myTemplate.helpers({
  displayName: function (firstName, lastName, keyword) {
    var prefix = keyword.hash.title ? keyword.hash.title + " " : "";
    return prefix + firstName + " " + lastName;
  }
});
```

Then you can call this helper from template like this:

```
{{dstache}}displayName "John" "Doe" title="President"}}
```

You can learn more about arguments to helpers in [Spacebars
Readme](https://atmospherejs.com/meteor/spacebars).

Under the hood, each helper starts a new
[`Tracker.autorun`](#/full/tracker_autorun).  When its reactive
dependencies change, the helper is rerun. Helpers depend on their data
context, passed arguments and other reactive data sources accessed during
execution.

To create a helper that can be used in any template, use
[`Template.registerHelper`](#template_registerhelper).


{{> autoApiBox "Template#onRendered"}}

Callbacks added with this method are called once when an instance of
Template.*myTemplate* is rendered into DOM nodes and put into the document for
the first time.

In the body of a callback, `this` is a [template instance](#template_inst)
object that is unique to this occurrence of the template and persists across
re-renderings. Use the `onCreated` and `onDestroyed` callbacks to perform
initialization or clean-up on the object.

Because your template has been rendered, you can use functions like
[`this.findAll`](#template_findAll) which look at its DOM nodes.

This can be a good place to apply any DOM manipulations you want, after the
template is rendered for the first time.

```html
<template name="myPictures">
  <div class="container">
    {{#each pictures}}
      <img class=".item" src="/{{.}}"/>
    {{/each}}
  </div>
</template>
```

```javascript
Template.myPictures.onRendered(function () {
  // Use the Packery jQuery plugin
  this.$('.container').packery({
    itemSelector: '.item',
    gutter: 10
  });
});
```

{{> autoApiBox "Template#onCreated"}}

Callbacks added with this method called before your template's logic is
evaluated for the first time. Inside a callback, `this` is the new [template
instance](#template_inst) object. Properties you set on this object will be
visible from the callbacks added with `onRendered` and `onDestroyed` methods and
from event handlers.

These callbacks fire once and are the first group of callbacks to fire.
Handling the `created` event is a useful way to set up values on template
instance that are read from template helpers using `Template.instance()`.

```javascript
Template.myPictures.onCreated(function () {
  // set up local reactive variables
  this.highlightedPicture = new ReactiveVar(null);

  // register this template within some central store
  GalleryTemplates.push(this);
});
```

{{> autoApiBox "Template#onDestroyed"}}

These callbacks are called when an occurrence of a template is taken off
the page for any reason and not replaced with a re-rendering.  Inside
a callback, `this` is the [template instance](#template_inst) object
being destroyed.

This group of callbacks is most useful for cleaning up or undoing any external
effects of `created` or `rendered` groups. This group fires once and is the last
callback to fire.

```javascript
Template.myPictures.onDestroyed(function () {
  // deregister from some central store
  GalleryTemplates = _.without(GalleryTemplates, this);
});
```


<h2 id="template_inst"><span>Template instances</span></h2>

A template instance object represents an occurrence of a template in
the document.  It can be used to access the DOM and it can be
assigned properties that persist as the template is reactively updated.

Template instance objects are found as the value of `this` in the
`onCreated`, `onRendered`, and `onDestroyed` template callbacks, and as an
argument to event handlers.  You can access the current template instance
from helpers using [`Template.instance()`](#template_instance).

In addition to the properties and functions described below, you can assign
additional properties of your choice to the object. Use the
[`onCreated`](#template_onCreated) and [`onDestroyed`](#template_onDestroyed)
methods to add callbacks performing initialization or clean-up on the object.

You can only access `findAll`, `find`, `firstNode`, and `lastNode` from the
`onRendered` callback and event handlers, not from `onCreated` and
`onDestroyed`, because they require the template instance to be in the DOM.

Template instance objects are `instanceof Blaze.TemplateInstance`.

{{> autoApiBox "Blaze.TemplateInstance#findAll"}}

`template.findAll` returns an array of DOM elements matching `selector`.

{{> autoApiBox "Blaze.TemplateInstance#$"}}

`template.$` returns a [jQuery object](http://api.jquery.com/Types/#jQuery) of
those same elements. jQuery objects are similar to arrays, with
additional methods defined by the jQuery library.

The template instance serves as the document root for the selector. Only
elements inside the template and its sub-templates can match parts of
the selector.

{{> autoApiBox "Blaze.TemplateInstance#find"}}

Returns one DOM element matching `selector`, or `null` if there are no
such elements.

The template instance serves as the document root for the selector. Only
elements inside the template and its sub-templates can match parts of
the selector.

{{> autoApiBox "Blaze.TemplateInstance#firstNode"}}

The two nodes `firstNode` and `lastNode` indicate the extent of the
rendered template in the DOM.  The rendered template includes these
nodes, their intervening siblings, and their descendents.  These two
nodes are siblings (they have the same parent), and `lastNode` comes
after `firstNode`, or else they are the same node.

{{> autoApiBox "Blaze.TemplateInstance#lastNode"}}

{{> autoApiBox "Blaze.TemplateInstance#data"}}

This property provides access to the data context at the top level of
the template.  It is updated each time the template is re-rendered.
Access is read-only and non-reactive.

{{> autoApiBox "Blaze.TemplateInstance#autorun"}}

You can use `this.autorun` from a [`onCreated`](#template_onCreated) or
[`onRendered`](#template_onRendered) callback to reactively update the DOM
or the template instance.  The Computation is automatically stopped
when the template is destroyed.

Alias for `template.view.autorun`.

{{> autoApiBox "Blaze.TemplateInstance#subscribe"}}

You can use `this.subscribe` from an [`onCreated`](#template_onCreated) callback
to specify which data publications this template depends on. The subscription is
automatically stopped when the template is destroyed.

There is a complementary function `Template.instance().subscriptionsReady()`
which returns true when all of the subscriptions called with `this.subscribe`
are ready.

Inside the template's HTML, you can use the built-in helper
`Template.subscriptionsReady`, which is an easy pattern for showing loading
indicators in your templates when they depend on data loaded from subscriptions.

Example:

```js
Template.notifications.onCreated(function () {
  // Use this.subscribe inside onCreated callback
  this.subscribe("notifications");
});
```

```html
<template name="notifications">
  {{dstache}}#if Template.subscriptionsReady}}
    <!-- This is displayed when all data is ready. -->
    {{dstache}}#each notifications}}
      {{dstache}}> notification}}
    {{dstache}}/each}}
  {{dstache}}else}}
    Loading...
  {{dstache}}/if}}
</template>
```

Another example where the subscription depends on the data context:

```js
Template.comments.onCreated(function () {
  var self = this;

  // Use self.subscribe with the data context reactively
  self.autorun(function () {
    var dataContext = Template.currentData();
    self.subscribe("comments", dataContext.postId);
  });
});
```

```html
{{dstache}}#with post}}
  {{dstache}}> comments postId=_id}}
{{dstache}}/with}}
```

{{> autoApiBox "Blaze.TemplateInstance#view"}}

{{> autoApiBox "Template.registerHelper"}}

{{> autoApiBox "Template.instance"}}

{{> autoApiBox "Template.currentData"}}

{{> autoApiBox "Template.parentData"}}

For example, `Template.parentData(0)` is equivalent to `Template.currentData()`.  `Template.parentData(2)`
is equivalent to `{{dstache}}../..}}` in a template.

{{> autoApiBox "Template.body"}}

You can define helpers and event maps on `Template.body` just like on
any `Template.myTemplate` object.

Helpers on `Template.body` are only available in the `<body>` tags of
your app.  To register a global helper, use
[Template.registerHelper](#template_registerhelper).
Event maps on `Template.body` don't apply to elements added to the
body via `Blaze.render`, jQuery, or the DOM API, or to the body element
itself.  To handle events on the body, window, or document, use jQuery
or the DOM API.

{{> autoApiBox "Template.dynamic"}}

`Template.dynamic` allows you to include a template by name, where the name
may be calculated by a helper and may change reactively.  The `data`
argument is optional, and if it is omitted, the current data context
is used.

For example, if there is a template named "foo", `{{dstache}}> Template.dynamic
template="foo"}}` is equivalent to `{{dstache}}> foo}}`.

{{> apiBoxTitle name="Event Maps" id="eventmaps"}}

An event map is an object where
the properties specify a set of events to handle, and the values are
the handlers for those events. The property can be in one of several
forms:

<dl>
{{#dtdd "<em>eventtype</em>"}}
Matches a particular type of event, such as 'click'.
{{/dtdd}}

{{#dtdd "<em>eventtype selector</em>"}}
Matches a particular type of event, but only when it appears on
an element that matches a certain CSS selector.
{{/dtdd}}

{{#dtdd "<em>event1, event2</em>"}}
To handle more than one type of event with the same function, use a
comma-separated list.
{{/dtdd}}
</dl>

The handler function receives two arguments: `event`, an object with
information about the event, and `template`, a [template
instance](#template_inst) for the template where the handler is
defined.  The handler also receives some additional context data in
`this`, depending on the context of the current element handling the
event.  In a template, an element's context is the
data context where that element occurs, which is set by
block helpers such as `#with` and `#each`.

Example:

    {
      // Fires when any element is clicked
      'click': function (event) { ... },

      // Fires when any element with the 'accept' class is clicked
      'click .accept': function (event) { ... },

      // Fires when 'accept' is clicked or focused, or a key is pressed
      'click .accept, focus .accept, keypress': function (event) { ... }
    }

Most events bubble up the document tree from their originating
element.  For example, `'click p'` catches a click anywhere in a
paragraph, even if the click originated on a link, span, or some other
element inside the paragraph.  The originating element of the event
is available as the `target` property, while the element that matched
the selector and is currently handling it is called `currentTarget`.

    {
      'click p': function (event) {
        var paragraph = event.currentTarget; // always a P
        var clickedElement = event.target; // could be the P or a child element
      }
    }

If a selector matches multiple elements that an event bubbles to, it
will be called multiple times, for example in the case of `'click
div'` or `'click *'`.  If no selector is given, the handler
will only be called once, on the original target element.

The following properties and methods are available on the event object
passed to handlers:

<dl class="objdesc">
{{#dtdd name="type" type="String"}}
The event's type, such as "click", "blur" or "keypress".
{{/dtdd}}

{{#dtdd name="target" type="DOM Element"}}
The element that originated the event.
{{/dtdd}}

{{#dtdd name="currentTarget" type="DOM Element"}}
The element currently handling the event.  This is the element that
matched the selector in the event map.  For events that bubble, it may
be `target` or an ancestor of `target`, and its value changes as the
event bubbles.
{{/dtdd}}

{{#dtdd name="which" type="Number"}}
For mouse events, the number of the mouse button (1=left, 2=middle, 3=right).
For key events, a character or key code.
{{/dtdd}}

{{#dtdd "stopPropagation()"}}
Prevent the event from propagating (bubbling) up to other elements.
Other event handlers matching the same element are still fired, in
this and other event maps.
{{/dtdd}}

{{#dtdd "stopImmediatePropagation()"}}
Prevent all additional event handlers from being run on this event,
including other handlers in this event map, handlers reached by
bubbling, and handlers in other event maps.
{{/dtdd}}

{{#dtdd "preventDefault()"}}
Prevents the action the browser would normally take in response to this
event, such as following a link or submitting a form.  Further handlers
are still called, but cannot reverse the effect.
{{/dtdd}}

{{#dtdd "isPropagationStopped()"}}
Returns whether `stopPropagation()` has been called for this event.
{{/dtdd}}

{{#dtdd "isImmediatePropagationStopped()"}}
Returns whether `stopImmediatePropagation()` has been called for this event.
{{/dtdd}}

{{#dtdd "isDefaultPrevented()"}}
Returns whether `preventDefault()` has been called for this event.
{{/dtdd}}
</dl>

Returning `false` from a handler is the same as calling
both `stopImmediatePropagation` and `preventDefault` on the event.

Event types and their uses include:

<dl class="objdesc">
{{#dtdd "<code>click</code>"}}
Mouse click on any element, including a link, button, form control, or div.
Use `preventDefault()` to prevent a clicked link from being followed.
Some ways of activating an element from the keyboard also fire `click`.
{{/dtdd}}

{{#dtdd "<code>dblclick</code>"}}
Double-click.
{{/dtdd}}

{{#dtdd "<code>focus, blur</code>"}}
A text input field or other form control gains or loses focus.  You
can make any element focusable by giving it a `tabindex` property.
Browsers differ on whether links, checkboxes, and radio buttons are
natively focusable.  These events do not bubble.
{{/dtdd}}

{{#dtdd "<code>change</code>"}}
A checkbox or radio button changes state.  For text fields, use
`blur` or key events to respond to changes.
{{/dtdd}}

{{#dtdd "<code>mouseenter, mouseleave</code>"}} The pointer enters or
leaves the bounds of an element.  These events do not bubble.
{{/dtdd}}

{{#dtdd "<code>mousedown, mouseup</code>"}}
The mouse button is newly down or up.
{{/dtdd}}

{{#dtdd "<code>keydown, keypress, keyup</code>"}}
The user presses a keyboard key.  `keypress` is most useful for
catching typing in text fields, while `keydown` and `keyup` can be
used for arrow keys or modifier keys.
{{/dtdd}}

</dl>

Other DOM events are available as well, but for the events above,
Meteor has taken some care to ensure that they work uniformly in all
browsers.

{{> apiBoxTitle name="Spacebars" id="spacebars"}}

Spacebars is the language used to write Meteor templates. It is inspired by [Handlebars](http://handlebarsjs.com/). It shares some of the spirit and syntax of Handlebars, but has been tailored to produce reactive Meteor templates when compiled.

For more information about Spacebars, see the [Spacebars README](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md).

{{/template}}
