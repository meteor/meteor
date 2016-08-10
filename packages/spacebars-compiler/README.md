# spacebars-compiler
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/spacebars-compiler) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/spacebars-compiler)
***

The Spacebars compiler that is invoked at build time to compile
templates to JavaScript.

While this code is not normally ever shipped to the client, it can be
used at runtime on the server or the client by using the
`SpacebarsCompiler` symbol from this package.

The `spacebars` package, in contrast, contains the `Spacebars` symbol
and the Spacebars runtime, which is shipped to the client as part of
the app.

Read more about Spacebars, Blaze, and Meteor templating on the Blaze
[project page](https://www.meteor.com/blaze).
