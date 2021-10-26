---
title: Migrating to Meteor 1.8.3
description: How to migrate your application to Meteor 1.8.3.
---

Most of the new features in Meteor 1.8.3 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there is a required migration steps for those that use Blaze or jQuery.

<h3 id="npm-jquery">Use NPM jQuery</h3>

If your application uses `blaze-html-templates`, the Meteor `jquery`
package will be automatically installed in your `.meteor/packages` file
when you update to Meteor 1.8.3. However, this new version of the Meteor
`jquery` package no longer bundles its own copy of the `jquery` npm
implementation, so you may need to install `jquery` from npm by running

```sh
meteor npm i jquery
```

in your application directory. Symptoms of not installing jquery include
a blank browser window, with helpful error messages in the console.

<h2 id="older-versions">Migrating from a version older than 1.8.2?</h2>

If you're migrating from a version of Meteor older than Meteor 1.8.2, there may be important considerations not listed in this guide (which specifically covers 1.8.2 to 1.8.3). Please review the older migration guides for details:

* [Migrating to Meteor 1.8.2](1.8.2-migration.html) (from 1.8)
* [Migrating to Meteor 1.8](1.8-migration.html) (from 1.7)
* [Migrating to Meteor 1.7](1.7-migration.html) (from 1.6)
* [Migrating to Meteor 1.6](1.6-migration.html) (from 1.5)
* [Migrating to Meteor 1.5](1.5-migration.html) (from 1.4)
* [Migrating to Meteor 1.4](1.4-migration.html) (from 1.3)
* [Migrating to Meteor 1.3](1.3-migration.html) (from 1.2)
