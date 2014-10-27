# Blaze

Blaze is a powerful library for creating user interfaces by writing
reactive HTML templates.  Compared to using a combination of
traditional templates and jQuery, Blaze eliminates the need for all
the "update logic" in your app that listens for data changes and
manipulates the DOM.  Instead, familiar template directives like
`{{#if}}` and `{{#each}}` integrate with Tracker's "transparent
reactivity" and Minimongo's database cursors so that the DOM updates
automatically.

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

Read more on the Blaze [project page](http://www.meteor.com/blaze).


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
