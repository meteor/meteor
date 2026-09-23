# insecure
[Source code of released version](https://github.com/meteor/meteor/tree/master/packages/insecure) | [Source code of development version](https://github.com/meteor/meteor/tree/devel/packages/insecure)
***

Allow almost all collection methods, such as `insert`, `update`, and `remove`, to be called from the client. This package is useful for prototyping an app without worrying about database permissions, but should be removed as soon as the app needs to restrict database access.

As of Meteor 3.x, the `insecure` package is **not** included in new projects by default. To add it for prototyping, run `meteor add insecure`.