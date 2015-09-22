# coffeescript

[CoffeeScript](http://coffeescript.org/) is a little language that
compiles into JavaScript. It provides a simple syntax without lots of
braces and parentheses.  The code compiles one-to-one into the
equivalent JS, and there is no interpretation at runtime.

CoffeeScript is supported on both the client and the server. Files
ending with `.coffee`, `.litcoffee`, or `.coffee.md` are automatically
compiled to JavaScript.

### Namespacing and CoffeeScript

Here's how CoffeeScript works with Meteor's namespacing.

* Per the usual CoffeeScript convention, CoffeeScript variables are
  file-scoped by default (visible only in the `.coffee` file where
  they are defined.)

* When writing a package, CoffeeScript-defined variables can be
  exported like any other variable (see [Writing
  Packages](#writingpackages)). Exporting a variable pulls it up to
  package scope, meaning that it will be visible to all of the code in
  your app or package (both `.js` and `.coffee` files).

* Package-scope variables declared in `.js` files are visible in any
  `.coffee` files in the same app or project.

* To make a package-scope variable use the instruction `api.pckgscope()` in
  `package.js`.
