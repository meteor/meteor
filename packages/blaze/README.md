# Blaze

Blaze is a powerful library for creating user interfaces by writing
reactive HTML templates.  Compared to using a combination of
traditional templates and jQuery, Blaze eliminates the need for all
the "update logic" in your app that listens for data changes and
manipulates the DOM.  Instead, familiar template directives like

`{{#if}}` and `{{#each}}` integrate with
[Tracker's](https://meteor.com/tracker) "transparent reactivity" and
[Minimongo's](https://meteor.com/mini-databases) database cursors so
that the DOM updates automatically.

Read more on the Blaze [project page](http://www.meteor.com/blaze).

## Details

Blaze has two major parts:

* A template compiler that compiles template files into JavaScript
  code that runs against the Blaze runtime library.  Moreover, Blaze
  provides a compiler toolchain (think LLVM) that can be used to
  support arbitrary template syntaxes.  The flagship template syntax
  is Spacebars, a variant of Handlebars, but a community alternative
  based on Jade is already in use by many apps.

* A reactive DOM engine that builds and manages the DOM at runtime,
  invoked via templates or directly from the app, which features
  reactively updating regions, lists, and attributes; event
  delegation; and many callbacks and hooks to aid the app developer.

Blaze is sometimes compared to frameworks like React, Angular, Ember,
Polymer, Knockout, and others by virtue of its advanced templating
system.  What sets Blaze apart is a relentless focus on the developer
experience, using templating, transparent reactivity, and
interoperability with existing libraries to create a gentle learning
curve while enabling you to build world-class apps.

## Examples

Here are two Spacebars templates from an example app called
"Leaderboard" which displays a sorted list of top players and their
scores:

```html
<template name="leaderboard">
  <ol class="leaderboard">
    {{#each players}}
      {{> player}}
    {{/each}}
  </ol>
</template>

<template name="player">
  <li class="player {{selected}}">
    <span class="name">{{name}}</span>
    <span class="score">{{score}}</span>
  </li>
</template>
```

The template tags `{{name}}` and `{{score}}` refer to properties of
the data context (the current player), while `players` and `selected`
refer to helper functions.  Helper functions and event handlers are defined
in JavaScript:

```javascript
Template.leaderboard.helpers({
  players: function () {
    // Perform a reactive database query against minimongo
    return Players.find({}, { sort: { score: -1, name: 1 } });
  }
});

Template.player.events({
  'click': function () {
    // click on a player to select it
    Session.set("selectedPlayer", this._id);
  }
});

Template.player.helpers({
  selected: function () {
    return Session.equals("selectedPlayer", this._id) ? "selected" : '';
  }
});
```

No additional UI code is necessary to ensure that the list of players
stays up-to-date, or that the "selected" class is added and removed
from the LI elements as appropriate when the user clicks on a player.

Thanks to a powerful template language, it doesn't take much ceremony
to write a loop, include another template, or bind an attribute (or
part of an attribute).  And thanks to Tracker's transparent
reactivity, there's no ceremony around depending on reactive data
sources like the database or Session; it just happens when you read
the value, and when the value changes, the DOM will be updated in a
fine-grained way.

# Principles

## Gentle Learning Curve

To get started with Blaze, you don't have to learn a lot of concepts
or terminology.  As web developers, we are already students of HTML,
CSS, and JavaScript, which are complex technologies described in thick
books.  Blaze lets you apply your existing knowledge in exciting new
ways without having to read another book first.

Many factors go into making Blaze easy to pick up and use, including
the other principles below.  In general, we prefer APIs that lead to
simple and obvious-looking application code, and we recognize that
developers have limited time and energy to learn new and unfamiliar
terms and syntaxes.

It may sound obvious to "keep it simple" and prioritize the developer
experience when creating a system for reactive HTML, but it's also
challenging, and we think it's not done often enough!  We use feedback
from the Meteor community to ensure that Blaze's features stay simple,
understandable, and useful.

## Transparent Reactivity

Under the hood, Blaze uses the [Tracker](https://meteor.com/tracker)
library to automatically keep track of when to recalculate each
template helper.  If a helper reads a value from the client-side
database, for example, the helper will automatically be recalculated
when the value changes.

What this means for the developer is simple.  You don't have to
explicitly declare when to update the DOM, or even perform any
explicit "data-binding."  You don't have to know how Tracker works, or
even exactly what "reactivity" means, to benefit.  The result is less
thinking and less typing than other approaches.

## Clean Templates

Blaze embraces popular template syntaxes such as Handlebars and Jade
which are clean, readable, and familiar to developers coming from
other frameworks.

A good template language should clearly distinguish the special
"template directives" (often enclosed in curly braces) from the HTML,
and it should not obscure the structure of the resulting HTML.  These
properties make templating an easy concept to learn after static HTML
(or alongside it), and make templates easy to read, easy to style with
CSS, and easy to relate to the DOM.

In contrast, some newer frameworks try to remake templates as just
HTML (Angular, Polymer) or replace them with just JavaScript (React).
These approaches tend to obscure either the structure of the template,
or what is a real DOM element and what is not, or both.  In addition,
since templates are generally precompiled anyway as a best practice,
it's really not important that raw template source code be
browser-parsable.  Meanwhile, the developer experience of reading,
writing, and maintaining templates is hugely important.

## Plugin Interoperability

Web developers often share snippets of HTML, JavaScript, and CSS, or
publish them as libraries, widgets, or jQuery plugins.  They want to
embed videos, maps, and other third-party content.

Blaze doesn't assume it owns the whole DOM, and it tries to make as
few assumptions as possible about the DOM outside of its updates.
It hooks into jQuery's clean-up routines to prevent memory leaks,
and it preserves classes, attributes, and styles added to elements
by jQuery or any third-party library.

While it's certainly possible for Blaze and jQuery to step on each
other's toes if you aren't careful, there are established patterns for
keeping the peace, and Meteor users rightfully expect to be able to
use the various widgets and enhancements cooked up by the broader web
community in their apps.

# Comparisons to other libraries

Compared to Backbone and other libraries that simply re-render
templates, Blaze does much less re-rendering and doesn't suffer from
the dreaded "nested view" problem, which is when two templates can't
be updated independently of each other because one is nested inside
the other.  In addition, Blaze automatically determines when
re-rendering must occur, using Tracker.

Compared to Ember, Blaze offers finer-grained, automatic DOM updates.
Because Blaze uses Tracker's transparent reactivity, you don't have to
perform explicit "data-binding" to get data into your template, or
declare the data dependencies of each template helper.

Compared to Angular and Polymer, Blaze has a gentler learning curve,
simpler concepts, and nicer template syntax that cleanly separates
template directives and HTML.  Also, Blaze is targeted at today's
browsers and not designed around a hypothetical "browser of the
future."

Compared to React, Blaze emphasizes HTML templates rather than
JavaScript component classes.  Templates are more approachable than
JavaScript code and easier to read, write, and style with CSS.
Instead of using Tracker, React relies on a combination of explicit
"setState" calls and data-model diffing in order to achieve efficient
rendering.

# Future Work

### Components

Blaze will get better patterns for creating reusable UI components.
Templates already serve as reusable components, to a point.
Improvements will focus on:

* Argument-handling
* Local reactive state
* "Methods" that are callable from other components and have side
  effects, versus the current "helpers" which are called from the
  template language and are "pure"
* Scoping and the lookup chain
* Inheritance and configuration

### Forms

Most applications have a lot of forms, where input fields and other
widgets are used to enter data, which must then be validated and
turned into database changes.  Server-side frameworks like Rails and
Django have well-honed patterns for this, but client-side frameworks
are typically more lacking, perhaps because they are more estranged
from the database.

Meteor developers have already found ways and built packages to deal
with forms and validation, but we think there's a great opportunity to
make this part of the core, out-of-the-box Meteor experience.

### Mobile and Animation

Blaze will cater to the needs of the mobile web, including enhanced
performance and patterns for touch and other mobile interaction.

We'll also improve the ease with which developers can integrate
animated transitions into their apps.

### JavaScript Expressions in Templates

We plan to support JavaScript expressions in templates.  This will
make templates more expressive, and it will further shorten
application code by eliminating the need for a certain class of
one-line helpers.

The usual argument against allowing JavaScript expressions in a
template language is one of "separation of concerns" -- separating
business logic from presentation, so that the business logic may be
better organized, maintained, and tested independently.  Meanwhile,
even "logicless" template languages often include some concessions in
the form of microsyntax for filtering, querying, and transforming data
before using it.  This special syntax (and its extension mechanisms)
must then be learned.

While keeping business logic out of templates is indeed good policy,
there is a large class of "presentation logic" that is not really
separable from the concerns of templates and HTML, such as the code to
calculate styles and classes to apply to HTML elements or to massage
data records into a better form for templating purposes.  In many
cases where this code is short, it may be more convenient or more
readable to embed the code in the template, and it's certainly better
than evolving the template syntax in a direction that diverges from
JavaScript.

Because templates are already precompiled to JavaScript code, there is
nothing fundamentally difficult or inelegant about allowing a large
subset of JavaScript to be used within templates (see e.g. the project
Ractive.js).

### Other Template Enhancements

Source maps for debugging templates.  Imagine seeing your template
code in the browser's debugger!  Pretty slick.

True lexical scoping.

Better support for pluggable template syntax (e.g. Jade-like
templates).  There is already a Jade package in use, but we should
learn from it and clarify the abstraction boundary that authors of
template syntaxes are programming against.

### Pluggable Backends (don't require jQuery)

While Blaze currently requires jQuery, it is architected to run
against other "DOM backends" using a common adaptor interface.  You
should be able to use Zepto, or some very small shim if browser
compatibility is not a big deal for your application for some reason.
At the moment, no such adaptors besides the jQuery one have been
written.

The Blaze team experimented with dropping jQuery and talking directly
to "modern browsers," but it turns out there is about 5-10K of code at
the heart of jQuery that you can't throw out even if you don't care
about old browsers or supporting jQuery's app-facing API, which is
required just to bring browsers up to the modest expectations of web
developers.

### Better Stand-alone Support

Blaze will get better support for using it outside of Meteor, such as
regular stand-alone builds.

# Resources

* [Templates API](http://docs.meteor.com/#templates_api)
* [Blaze API](http://docs.meteor.com/#blaze)
* [Spacebars syntax](https://github.com/meteor/meteor/blob/devel/packages/spacebars/README.md)

# Packages

* blaze
* blaze-tools
* html-tools
* htmljs
* spacebars
* spacebars-compiler
