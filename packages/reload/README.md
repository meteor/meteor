# reload
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/reload) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/reload)
***

The `reload` package handles the process of *migrating* an app:
serializing the app's state, then shutting down and restarting the app
(for example, to load updated client code or to move the client
session from one JavaScript virtual machine to another), and finally
restoring its state.

Packages that want to participate in the migration process register
with `reload`. They can make the migration process wait until they are
ready and include whatever state they may possess in the serialization
and deserialization process.

`reload` is part of the [Webapp](https://github.com/meteor/meteor/tree/master/packages/webapp) project.
