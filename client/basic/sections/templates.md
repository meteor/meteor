{{#template name="basicTemplates"}}

<h2 id="templates"><span>Templates</span></h2>

In Meteor, you define your views in _templates_. A template is a snippet of
HTML that can also include special pieces of code to include data and change
which parts of the page are displayed.

<h3 class="api-title" id="defining-templates">Defining Templates in HTML</h3>

Templates are defined in '.html' files that can be located anywhere in your
Meteor project folder except the `server`, `public`, and `private` directories.

Each HTML file can have any number of three types of top-level elements:
`<head>`, `<body>`, or `<template>`. Code in the `<head>` and `<body>` tags is
appended to that section of the HTML page, and code inside `<template>` tags can
be included using `{{dstache}}> templateName}}`, as shown in the example below.
Templates can be included more than once - one of the main purposes of templates
is to reduce view code duplication.

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

The `{{dstache}} ... }}` syntax is part of a language called "Spacebars" that
Meteor uses to add functionality to HTML. As shown above, it lets you include
templates in other parts of your page. Using Spacebars, you can also display
data passed in via _helpers_. Helpers can be static values or functions.

```
// In JavaScript, define a helper called "nametag" on our template
Template.nametag.helpers({
  name: "Ben Bitdiddle"
});
```

```
<!-- In an HTML file, display the value of the helper -->
<template name="nametag">
  <p>My name is {{dstache}}name}}.</p>
</template>
```

Spacebars also has a few other handy functions that can be used to make your
views more dynamic.

- `{{dstache}}#each data}} ... {{dstache}}/each}}` - Iterate over the items in
`data` and display the HTML inside the block for each one.
- `{{dstache}}#if data}} ... {{dstache}}else}} ... {{dstache}}/if}}` - If `data`
is `true`, display the first block; if it is false, display the second one.
- `{{dstache}}#with data}} ... {{dstache}}/with}}` - Set the data context of
the HTML inside, and display it.

In addition to using helpers, Spacebars lets you display data by having a _data
context_ inside every block. This means that you can use `{{dstache}}property}}`
to reference a property on the object currently in the data context.

```
// helper 'people' is:
// [{name: "Bob"}, {name: "Frank"}, {name: "Alice"}]

<!-- show every person's name -->
{{dstache}}#each people}}
  <p>{{dstache}}name}}</p>
{{dstache}}/each}}

<!-- or we can use the nametag template from above -->
{{dstache}}#each people}}
  <p>{{dstache}}> nametag}}</p>
{{dstache}}/each}}
```

You can find detailed documentation for Spacebars in the
[README on GitHub](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md).

{{> autoApiBox "Template#helpers"}}

Each template has a local dictionary of helpers that it can use to inject data
into the HTML. Call `Template.myTemplate.helpers()` to add to this dictionary,
and use the data in your templates with `{{helperName}}`.

For example, to show the logged in user's username:

```
// in your JS file
Template.profilePage.helpers({
  username: function () {
    return Meteor.user() && Meteor.user().username;
  }
});
```

```
// in your HTML
<template name="profilePage">
  <p>Profile page for {{username}}</p>
</template>
```

The sections about `Session`, `Tracker`, `Collections`, and `Accounts` will talk
more about how to add dynamic data to your templates.

You can also register a helper to be available in all templates by using
[`Template.registerHelper`](#template_registerhelper).

{{> autoApiBox "Template#events"}}

The event map passed into `Template.myTemplate.events` has event descriptors
as its keys and functions as the values. Event handlers get two arguments:
the event object and the template instance.

```
<!-- an example template -->
<template name="example">
  <button class="my-button">My button</button>
  <form>
    <input type="text" name="myInput" />
    <input type="submit" value="Submit Form" />
  </form>
</template>
```

```
// Adding events to a template
Template.example.events({
  "click .my-button": function (event, template) {
    alert("My button was clicked!");
  },
  "submit form": function (event, template) {
    var inputValue = event.target.myInput.value;
    alert(inputValue);
  }
});
```

The first part of the key is the name of the event being captured. Pretty much
any DOM event is supported. Some common ones are: `click`, `mousedown`,
`mouseup`, `mouseenter`, `mouseleave`, `keydown`, `keyup`, `keypress`, `focus`,
`blur`, and `change`.

The second part is a selector that indicates which elements to listen to. This
can be almost any selector
[supported by JQuery](http://api.jquery.com/category/selectors/).

Whenever the indicated event happens on the selected element, the function
given in the event map will be called with the relevant DOM event and
template instance. See the [Event Maps section](#eventmaps) for details.

{{> autoApiBox "Template#rendered"}}

The function assigned to this property is called once for every instance of
Template.*myTemplate* when it is inserted into the document for the first time.

The _rendered_ callback can be used to integrate external libraries that aren't
familiar with Meteor's automatic view rendering, and need to be initialized
every time HTML is inserted into the page. Use the
[`created`](http://docs.meteor.com/#template_created) and
[`destroyed`](http://docs.meteor.com/#template_destroyed) callbacks to perform
initialization or clean-up on any objects.

```
// Apply code highlighting to <pre> elements inside when
// the template is rendered (need to include HighlightJS)
Template.codeSample.rendered = function () {
  hljs.highlightBlock(this.findAll('pre'));
};
```

In the callback function, `this` is bound to a [template
instance](#template_inst) object that is unique to this inclusion of the
template and remains across re-renderings. You can use functions like
[`this.findAll`](#template_findAll) to get DOM nodes in this template's rendered
HTML.

<h2 id="template_inst"><span>Template instances</span></h2>

A template instance object represents a single inclusion of a template in the
document.  It can be used to access the DOM and it can be assigned properties
that persist as the template is reactively updated.

Template instance objects can be found in several places:

1. The value of `this` in the `created`, `rendered`,
and `destroyed` template callbacks
2. The second argument to event handlers
3. As [`Template.instance()`](#template_instance) inside helpers

You can assign additional properties of your choice to the template instance to
keep track any state relevant to the template. For example, when using the
Google Maps API you could attach the `map` object to the current template
instance to be able to refer to it in helpers and event handlers. Use the
[`created`](#template_created) and [`destroyed`](#template_destroyed) callbacks
to perform initialization or clean-up.

{{> autoApiBox "Blaze.TemplateInstance#findAll"}}

`template.findAll` returns an array of DOM elements matching `selector`. You can
also use `template.$`, which works exactly like JQuery but only returns elements
from this template.

{{> autoApiBox "Blaze.TemplateInstance#find"}}

Get one DOM element matching `selector`, or `null` if there are no
such elements. Like `findAll`, `find` only returns elements from inside the
template.

{{/template}}