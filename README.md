# Call for maintainers

Since I'm no longer actively developing an app that uses `migrations`, I've lost touch with the codebase and the project. I'm looking for folks to take over development and maintenance, please raise your hand if you're interested via [this issue](https://github.com/percolatestudio/meteor-migrations/issues/59).

# percolate:migrations

[![Build Status](https://travis-ci.org/percolatestudio/meteor-migrations.svg?branch=master)](https://travis-ci.org/percolatestudio/meteor-migrations)

A simple migration system for [Meteor](http://meteor.com) supporting up/downwards migrations and command line usage.

## Installation

Meteor Migrations can be installed through Meteor's package manager. Type:

``` sh
$ meteor add percolate:migrations
```

## API

### Basics

To write a simple migration, somewhere in the server section of your project define:

``` javascript
Migrations.add({
  version: 1,
  up: function() {//code to migrate up to version 1}
});
```

To run this migration from within your app call:

``` javascript
Meteor.startup(() => {
  Migrations.migrateTo('latest');
});
```

### Advanced

A more complete set of migrations might look like:

``` javascript
Migrations.add({
  version: 1,
  name: 'Adds pants to some people in the db.',
  up: function() {//code to migrate up to version 1}
  down: function() {//code to migrate down to version 0}
});

Migrations.add({
  version: 2,
  name: 'Adds a hat to all people in the db who are wearing pants.',
  up: function() {//code to migrate up to version 2}
  down: function() {//code to migrate down to version 1}
});
```

As in 'Basics', you can migrate to the latest by running:

``` javascript
Meteor.startup(function() {
  Migrations.migrateTo('latest');
});
```

*Note: Migrations should be run from `Meteor.startup` to allow for log output configuration.*

By specifying a version, you can migrate directly to that version (if possible). The migrations system will automatically determine which direction to migrate in.

In the above example, you could migrate directly to version 2 by running:

``` javascript
Migrations.migrateTo(2);
```

If you wanted to undo all of your migrations, you could migrate back down to version 0 by running:

``` javascript
Migrations.migrateTo(0);
```

Sometimes (usually when somethings gone awry), you may need to re-run a migration. You can do this with the rerun subcommand, like:

``` javascript
Migrations.migrateTo('3,rerun');
```

**NOTE**: You cannot create your own migration at version 0. This version is reserved by migrations for a 'vanilla' system, that is, one without any migrations applied.

To see what version the database is at, call:

``` javascript
Migrations.getVersion();
```

### Configuration

You can configure Migrations with the `config` method. Defaults are:

``` javascript
Migrations.config({
  // Log job run details to console
  log: true,

  // Use a custom logger function (defaults to Meteor's logging package)
  logger: null,

  // Enable/disable logging "Not migrating, already at version {number}"
  logIfLatest: true,

  // migrations collection name to use in the database
  collectionName: "migrations"
});
```

### Logging

Migrations uses Meteor's `logging` package by default. If you want to use your
own logger (for sending to other consumers or similar) you can do so by
configuring the `logger` option.

Migrations expects a function as `logger`, and will pass arguments to it for
you to take action on.

```js
var MyLogger = function(opts) {
  console.log('Level', opts.level);
  console.log('Message', opts.message);
  console.log('Tag', opts.tag);
}

Migrations.config({
  logger: MyLogger
});

Migrations.add({ name: 'Test Job', ... });
Migrations.start();
```

The `opts` object passed to `MyLogger` above includes `level`, `message`, and `tag`.

- `level` will be one of `info`, `warn`, `error`, `debug`.
- `message` is something like `Finished migrating.`.
- `tag` will always be `"Migrations"` (handy for filtering).

### Custom collection name

By default, the collection name is **migrations**. There may be cases where this is inadequate such as using the same Mongo database for multiple Meteor applications that each have their own set of migrations that need to be run.

### Command line use

*** DEPRECATED ***

This info is for pre 0.9 users as post 0.9 the `migrate.sh` script is no longer included in the package folder.

You can also run migrations from the command line using the included shell script. This will

1. Launch your Meteor app
2. Call `Migrations.migrateTo(version)`
3. Exit your app

For instance, from your project's root, run:

``` sh
$ ./packages/percolatestudio-migrations/migrate.sh latest
```

You can also specify additional arguments to be passed into meteor, like:

``` sh
$ ./packages/percolatestudio-migrations/migrate.sh latest --settings ./setting.json
```

### Errors
1. `Not migrating, control is locked`

  Migrations set a lock when they are migrating, to prevent multiple instances of your clustered app from running migrations simultaneously. If your migrations throw an exception, you will need to manually remove the lock (and ensure your db is still consistent) before re-running the migration. Update the migrations collection like this:

  ```
  $ meteor mongo

  db.migrations.update({_id:"control"}, {$set:{"locked":false}});
  exit
  ```

## Contributing

1. Write some code.
2. Write some tests.
3. From this package's local directory, start the test runner:

    ```
    $ meteor test-packages ./
    ```

4. Open http://localhost:3000/ in your browser to see the test results.


## License

MIT. (c) Percolate Studio, maintained by Zoltan Olah (@zol).

Meteor Migrations was developed as part of the [Verso](http://versoapp.com) project.
