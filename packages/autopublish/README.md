# autopublish
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/autopublish) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/autopublish)
***

Publish all server collections to the client. This package is useful for prototyping an app without worrying about which clients have access to certain data, but should be removed as soon as the app needs to restrict which data is seen by the client.

As of Meteor 3.x, the `autopublish` package is **not** included in new projects by default. To add it for prototyping, run `meteor add autopublish`.