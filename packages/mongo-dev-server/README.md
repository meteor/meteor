# mongo-dev-server

[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/mongo-dev-server) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/mongo-dev-server)
***

When the `mongo-dev-server` package is included in a Meteor application, a
local development MongoDB server is started alongside the application. This
package is mostly used internally, as it is included by default with any
application that has a dependency on `mongo` (which is most Meteor
applications). In some cases however, people might be interested in
using the Meteor Tool without having to start a local development Mongo
instance (e.g. when using Meteor as a build system). If an application has no
dependency on `mongo`, the `mongo-dev-server` package will be removed
(since it is a direct dependency of the `mongo` package), and no local
development Mongo server will be started.

Note this is a `debugOnly` package, meaning it will not be included in any
production bundles.
