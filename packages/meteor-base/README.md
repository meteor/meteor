# meteor-base
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/meteor-base) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/meteor-base)
***

A default set of packages that almost every app will have. You should only remove this package if you really, really know what you are doing.

It comes with the following packages:

1. [`meteor`](https://atmospherejs.com/meteor/meteor) - Super basic stuff about the programming environment, and a handler for the `css` file type.
2. [`webapp`](https://atmospherejs.com/meteor/webapp) - The actual web server that handles connections, serves files, etc.
3. [`underscore`](https://atmospherejs.com/meteor/underscore) - A library with lots of useful utilities that most of Meteor is built on.
4. [`hot-code-push`](https://atmospherejs.com/meteor/hot-code-push) - Refresh the client automatically when the server has new code.
5. [`ddp`](https://atmospherejs.com/meteor/ddp) - A protocol for communicating between the client and server. This is what enables `Meteor.methods`, `Meteor.publish`, `Meteor.subscribe`, etc.
