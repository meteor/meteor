---
title: Migrating to Meteor 2.0
description: How to migrate your application to Meteor 2.0.
---

Most of the new features in Meteor 2.0 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there is a thing to note.

<h3 id="hmr">Hot Module Replacement</h3>

Updates the javascript modules in a running app that were modified during a rebuild. Reduces the feedback cycle while developing so you can view and test changes quicker (it even updates the app before the build has finished). Enabled by adding the `hot-module-replacement` package to an app. React components are automatically updated by default using React Fast Refresh. Integrations with other libraries and view layers can be provided by third party packages. Support for Blaze is coming soon. This first version supports app code in the modern web architecture. ([docs](https://guide.meteor.com/build-tool.html#hot-module-replacement)) [#11117](https://github.com/meteor/meteor/pull/11117)

<h3 id="free-cloud">Free tier for Meteor Cloud is back</h3>

Free deploy on [Cloud](https://www.meteor.com/cloud): Deploy for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy))

Deploy including MongoDB on [Cloud](https://www.meteor.com/cloud): Deploy including MongoDB in a shared instance for free to Cloud with one command: `meteor deploy myapp.meteorapp.com --free --mongo`. ([docs](https://docs.meteor.com/commandline.html#meteordeploy))

<h2 id="older-versions">Migrating from a version older than 1.12?</h2>

If you're migrating from a version of Meteor older than Meteor 1.12, there may be important considerations not listed in this guide (which specifically covers 1.12 to 2.0). Please review the older migration guides for details:

* [Migrating to Meteor 1.12](1.12-migration.html) (from 1.11)
* [Migrating to Meteor 1.11](1.11-migration.html) (from 1.10.2)
* [Migrating to Meteor 1.10.2](1.10.2-migration.html) (from 1.10)
* [Migrating to Meteor 1.10](1.10-migration.html) (from 1.9.3)
* [Migrating to Meteor 1.9.3](1.9.3-migration.html) (from 1.9)
* [Migrating to Meteor 1.9](1.9-migration.html) (from 1.8.3)
* [Migrating to Meteor 1.8.3](1.8.3-migration.html) (from 1.8.2)
* [Migrating to Meteor 1.8.2](1.8.2-migration.html) (from 1.8)
* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
