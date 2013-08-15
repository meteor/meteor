<h2 id="structuringyourapp">Structuring your application</h2>

A Meteor application is a mix of JavaScript that runs inside a client web
browser, JavaScript that runs on the Meteor server inside a
[Node.js](http://nodejs.org/) container, and all the supporting HTML fragments,
CSS rules, and static assets.  Meteor automates the packaging and transmission
of these different components.  And, it is quite flexible about how you choose
to structure those components in your file tree.

The only server assets are JavaScript and files in the `private` subdirectory.
Meteor gathers all your JavaScript
files, excluding anything under the `client`, `public`, and `private`
subdirectories, and loads them into a Node.js
server instance inside a fiber.  In Meteor, your server code runs in
a single thread per request, not in the asynchronous callback style
typical of Node.  We find the linear execution model a better fit for
the typical server code in a Meteor application.

Meteor gathers any files under the `private` subdirectory and makes the contents
of these files available to server code via the [`Assets`](#assets) API. The
`private` subdirectory is the place for any files that should be accessible to
server code but not served to the client, like private data files.

There are more assets to consider on the client side.  Meteor
gathers all JavaScript files in your tree, with the exception of
the `server`, `public`, and `private` subdirectories, for the
client.  It minifies this bundle and serves it to each new client.
You're free to use a single JavaScript file for your entire application, or
create a nested tree of separate files, or anything in between.

Some JavaScript libraries only work when placed in the
`client/compatibility` subdirectory.  Files in this directory are
executed without being wrapped in a new variable scope.  This means
that each top-level `var` defines a global variable. In addition,
these files are executed before other client-side JavaScript files.

Files outside the `client`, `server` and `tests` subdirectories are loaded on
both the client and the server!  That's the place for model definitions and
other functions.  Meteor provides the variables [`isClient`](#meteor_isclient) and
[`isServer`](#meteor_isserver) so that your code can alter its behavior depending
on whether it's running on the client or the server. (Files in directories named
`tests` are not loaded anywhere.)

Any sensitive code that you don't want served to the client, such as code
containing passwords or authentication mechanisms, should be
kept in the `server` directory.

CSS files are gathered together as well: the client will get a bundle with all
the CSS in your tree (excluding the `server`,
`public`, and `private` subdirectories).

In development mode, JavaScript and CSS files are sent individually to make
debugging easier.

HTML files in a Meteor application are treated quite a bit differently
from a server-side framework.  Meteor scans all the HTML files in your
directory for three top-level elements: `<head>`, `<body>`, and
`<template>`.  The head and body sections are separately concatenated
into a single head and body, which are transmitted to the client on
initial page load.

Template sections, on the other hand, are converted into JavaScript
functions, available under the `Template` namespace.  It's
a really convenient way to ship HTML templates to the client.
See the [templates](#templates) section for more.

Lastly, the Meteor server will serve any files under the `public`
directory, just like in a Rails or Django project.  This is the place
for images, `favicon.ico`, `robots.txt`, and anything else.

It is best to write your application in such a way that it is
insensitive to the order in which files are loaded, for example by
using [Meteor.startup](#meteor_startup), or by moving load order
sensitive code into [packages](#usingpackages), which can explicitly control both
the load order of their contents and their load order with respect to
other packages. However sometimes load order dependencies in your
application are unavoidable. The JavaScript and CSS files in an
application are loaded according to these rules:

* Files in the `lib` directory at the root of your application are
  loaded first.

* Files that match `main.*` are loaded after everything else.

* Files in subdirectories are loaded before files in parent
  directories, so that files in the deepest subdirectory are loaded
  first (after `lib`), and files in the root directory are loaded last
  (other than `main.*`).

* Within a directory, files are loaded in alphabetical order by
  filename.

These rules stack, so that within `lib`, for example, files are still
loaded in alphabetical order; and if there are multiple files named
`main.js`, the ones in subdirectories are loaded earlier.
