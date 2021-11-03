---
title: Migrating to Meteor 1.10.2
description: How to migrate your application to Meteor 1.10.2.
---

Most of the new features in Meteor 1.10.2 are either applied directly behind the scenes (in a backwards compatible manner) or are opt-in. For a complete breakdown of the changes, please refer to the [changelog](http://docs.meteor.com/changelog.html).

The above being said, there is a breaking change for those using the Flow syntax.

<h3 id="flow-unsupported">Flow syntax not supported</h3>

The `babel-compiler` package, used by both `ecmascript` and
`typescript`, no longer supports stripping [Flow](https://flow.org/)
type annotations by default, which may be a breaking change if your
application (or Meteor package) relied on Flow syntax.

If you still need Babel's Flow plugins, you can install them with npm
and then enable them with a custom `.babelrc` file in your application's
(or package's) root directory:

```json
{
"plugins": [
  "@babel/plugin-syntax-flow",
  "@babel/plugin-transform-flow-strip-types"
]
}
```

<h2 id="older-versions">Migrating from a version older than 1.10?</h2>

If you're migrating from a version of Meteor older than Meteor 1.10, there may be important considerations not listed in this guide (which specifically covers 1.10 to 1.10.2). Please review the older migration guides for details:

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
