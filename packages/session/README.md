# session
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/session) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/session)
***

This package provide `Session`. `Session` is a special
[ReactiveDict](https://atmospherejs.com/meteor/reactive-dict) whose
contents are preserved across Hot Code Push. It's usually used to
store the current state of the user interface, for example, the
currently selected row in a table, ora flag indicating if a dialog box
is open.

Full documentation of `Session` can be found on the [main Meteor docs
page](https://docs.meteor.com/#session).

## Future work

Unify with [reactive-dict](https://atmospherejs.com/meteor/reactive-dict).
