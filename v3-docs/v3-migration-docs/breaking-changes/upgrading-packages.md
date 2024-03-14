# Upgrading packages


## Client

For the packages that are client only
or that are do not using Meteor packages that will become async
or are already using `async` & `await` pattern.

The migration will look like this:

```js
// in you package.js
Package.onUse((api) => {
  api.versionsFrom(['1.10', '2.3', '3.0-beta.6']);
  //                               ^^^^^^^ for testing your package with meteor 3.0

  api.versionsFrom(['1.10', '2.3', '3.0']);
  //                              ^^^^^^^ for meteor 3.0

```
Then you can publish your package and test it with Meteor 3.0, by running `meteor publish`.

## Testing packages in Meteor 3.0

It is known that some packages that are testing the beta changes are not being installed by correctly,
when using a tag in their version, like this one: `version: '2.0.0-beta300.6',` to be sure that you are getting the correct version
you can run `meteor add <package>@<version-tag>` to install the package with the correct version, instead of the `meteor add <package>`.


## Server

If in your package you are using Meteor packages that will become async,
you will need to migrate your package to use `async` & `await` pattern.

For concrete examples you can check a few examples of packages that have been in the works
of migrating to Meteor 3.0:

-   [`quave:migrations`](https://github.com/quavedev/meteor-migrations/pull/1)
-   [`percolate:synced-cron`](https://github.com/percolatestudio/meteor-synced-cron/pull/149)
-   [`react-meteor-accounts`](https://github.com/meteor/react-packages/commit/96313a1afcc41ef9a23c7496470b375e7d357793)
-   [`mdg:seo`](https://github.com/meteor/galaxy-seo-package/commit/8a30b32688df40e62ce434475dd3ee931dedf2b3)

You can follow a more in depth guide on how to migrate your package to be compatible with Meteor 3.0 [here](https://guide.meteor.com/prepare-meteor-3.0#Changes-for-packages).
