{{#template name="basicTemplates"}}

<h2 id="templates"><span>Templates</span></h2>

In Meteor, views are defined in _templates_. A template is a snippet of HTML
that can include dynamic data. You can also interact with your templates from
JavaScript code to insert data and listen to events.

<h3 class="api-title" id="defining-templates">Defining Templates in HTML</h3>

Templates are defined in `.html` files that can be located anywhere in your
Meteor project folder except the `server`, `public`, and `private` directories.

Each `.html` file can contain any number of the following top-level elements:
`<head>`, `<body>`, or `<template>`. Code in the `<head>` and `<body>` tags is
appended to that section of the HTML page, and code inside `<template>` tags can
be included using `{{dstache}}> templateName}}`, as shown in the example below.
Templates can be included more than once &mdash; one of the main purposes of
templates is to avoid writing the same HTML multiple times by hand.

```
<!-- add code to the <head> of the page -->
<head>
  <title>My website!</title>
</head>

<!-- add code to the <body> of the page -->
<body>
  <h1>Hello!</h1>
  {{dstache}}> welcomePage}}
</body>

<!-- define a template called welcomePage -->
<template name="welcomePage">
  <p>Welcome to my website!</p>
</template>
```

The `{{dstache}} ... }}` syntax is part of a language called Spacebars that
Meteor uses to add functionality to HTML. As shown above, it lets you include
templates in other parts of your page. Using Spacebars, you can also display
data obtained from _helpers_. Helpers are written in JavaScript, and can be
either simple values or functions.

{{> autoApiBox "Template#helpers"}}

Here's how you might define a helper called `name` for a template called
`nametag` (in JavaScript):

```
Template.nametag.helpers({
  name: "Ben Bitdiddle"
});
```

And here is the `nametag` template itself (in HTML):

```
<!-- In an HTML file, display the value of the helper -->
<template name="nametag">
  <p>My name is {{dstache}}name}}.</p>
</template>
```

Spacebars also has a few other handy control structures that can be used
to make your views more dynamic:

- `{{dstache}}#each data}} ... {{dstache}}/each}}` - Iterate over the items in
`data` and display the HTML inside the block for each one.
- `{{dstache}}#if data}} ... {{dstache}}else}} ... {{dstache}}/if}}` - If `data`
is `true`, display the first block; if it is false, display the second one.
- `{{dstache}}#with data}} ... {{dstache}}/with}}` - Set the data context of
the HTML inside, and display it.

Each nested `#each` or `#with` block has its own _data context_, which is
an object whose properties can be used as helpers inside the block. For
`#with` blocks, the data context is simply the value that appears after
the `#with` and before the `}}` characters. For `#each` blocks, each
element of the given array becomes the data context while the block is
evaluated for that element.

For instance, if the `people` helper has the following value

```
Template.welcomePage.helpers({
  people: [{name: "Bob"}, {name: "Frank"}, {name: "Alice"}]
});
```

then you can display every person's name as a list of `<p>` tags:

```html
{{dstache}}#each people}}
  <p>{{dstache}}name}}</p>
{{dstache}}/each}}
```

or use the "nametag" template from above instead of `<p>` tags:

```html
{{dstache}}#each people}}
  {{dstache}}> nametag}}
{{dstache}}/each}}
```

Remember that helpers can be functions as well as simple values. For
example, to show the logged in user's username, you might define a
function-valued helper called `username`:

```
// in your JS file
Template.profilePage.helpers({
  username: function () {
    return Meteor.user() && Meteor.user().username;
  }
});
```

Now, each time you use the `username` helper, the helper function above
will be called to determine the user's name:

```
<!-- in your HTML -->
<template name="profilePage">
  <p>Profile page for {{dstache}}username}}</p>
</template>
```

Helpers can also take arguments. For example, here's a helper that pluralizes
a word:

```js
Template.post.helpers({
  commentCount: function (numComments) {
    if (numComments === 1) {
      return "1 comment";
    } else {
      return numComments + " comments";
    }
  }
});
```

Pass in arguments by putting them inside the curly braces after the name of the
helper:

```html
<p>There are {{dstache}}commentCount 3}}.</p>
```

The helpers above have all been associated with specific templates, but
you can also make a helper available in all templates by using
[`Template.registerHelper`](#template_registerhelper).

You can find detailed documentation for Spacebars in the
[README on GitHub](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md).
Later in this documentation, the sections about `Session`, `Tracker`,
`Collections`, and `Accounts` will talk more about how to add dynamic data
to your templates.


{{> autoApiBox "Template#events"}}

The event map passed into `Template.myTemplate.events` has event descriptors as
its keys and event handler functions as the values. Event handlers get two
arguments: the event object and the template instance. Event handlers can also
access the data context of the target element in `this`.

To attach event handlers to the following template

```
<template name="example">
  {{dstache}}#with myHelper}}
    <button class="my-button">My button</button>
    <form>
      <input type="text" name="myInput" />
      <input type="submit" value="Submit Form" />
    </form>
  {{dstache}}/with}}
</template>
```

you might call `Template.example.events` as follows:

```
Template.example.events({
  "click .my-button": function (event, template) {
    alert("My button was clicked!");
  },
  "submit form": function (event, template) {
    var inputValue = event.target.myInput.value;
    var helperValue = this;
    alert(inputValue, helperValue);
  }
});
```

The first part of the key (before the first space) is the name of the
event being captured. Pretty much any DOM event is supported. Some common
ones are: `click`, `mousedown`, `mouseup`, `mouseenter`, `mouseleave`,
`keydown`, `keyup`, `keypress`, `focus`, `blur`, and `change`.

The second part of the key (after the first space) is a CSS selector that
indicates which elements to listen to. This can be almost any selector
[supported by JQuery](http://api.jquery.com/category/selectors/).

Whenever the indicated event happens on the selected element, the
corresponding event handler function will be called with the relevant DOM
event object and template instance. See the [Event Maps section](#eventmaps)
for details.
<!-- TODO Update the link to full docs for Event Maps -->

{{> autoApiBox "Template#onRendered"}}

The functions added with this method are called once for every instance of
*Template.myTemplate* when it is inserted into the page for the first time.

These callbacks can be used to integrate external libraries that
aren't familiar with Meteor's automatic view rendering, and need to be
initialized every time HTML is inserted into the page.
You can perform initialization or clean-up on any objects in
[`onCreated`](#template_oncreated) and [`onDestroyed`](#template_ondestroyed)
callbacks.

For example, to use the HighlightJS library to apply code highlighting to
all `<pre>` elements inside the `codeSample` template, you might pass
the following function to `Template.codeSample.onRendered`:

```
Template.codeSample.onRendered(function () {
  hljs.highlightBlock(this.findAll('pre'));
});
```

In the callback function, `this` is bound to a [template
instance](#template_inst) object that is unique to this inclusion of the
template and remains across re-renderings. You can use methods like
[`this.find`](#template_find) and
[`this.findAll`](#template_findAll) to access DOM nodes in the template's
rendered HTML.

<h2 id="template_inst"><span>Template instances</span></h2>

A template instance object represents a single inclusion of a template in the
document.  It can be used to access the HTML elements inside the template and it
can be assigned properties that persist as the template is reactively updated.

Template instance objects can be found in several places:

1. The value of `this` in the `created`, `rendered`,
   and `destroyed` template callbacks
2. The second argument to event handlers
3. As [`Template.instance()`](#template_instance) inside helpers

You can assign additional properties of your choice to the template instance to
keep track of any state relevant to the template. For example, when using the
Google Maps API you could attach the `map` object to the current template
instance to be able to refer to it in helpers and event handlers. Use the
[`onCreated`](#template_onCreated) and [`onDestroyed`](#template_onDestroyed)
callbacks to perform initialization or clean-up.

{{> autoApiBox "Blaze.TemplateInstance#findAll"}}

`template.findAll` returns an array of DOM elements matching `selector`. You can
also use `template.$`, which works exactly like the JQuery `$` function but only
returns elements within `template`.

{{> autoApiBox "Blaze.TemplateInstance#find"}}

<!-- XXX Why is this not findOne? -->

`find` is just like `findAll` but only returns the first element found. Like
`findAll`, `find` only returns elements from inside the template.

{{/template}}
