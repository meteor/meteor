# percolate:migrations

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
Migrations.migrateTo('latest');
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
Migrations.migrateTo('latest');
```

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

  Migrations set a lock when they are migrating, to prevent multiple instances to prevent multiple instances of your clustered app from running migrations simultaneously. If you migrations throw an exception, you will need to manually remove the lock (and ensure your db is still consistent) before re-running the migration. Update the migrations collection like this:

  ``` sh
  meteor mongo
  db.migrations.update({_id:"control"}, {$set:{"locked":false}});
  exit
  ```

## Contributing

Write some code. Write some tests. To run the tests, do:

``` sh
$ meteor test-packages percolatestudio:percolatestudio-migrations
```

## License 

MIT. (c) Percolate Studio

Meteor Migrations was developed as part of the [Verso](http://versoapp.com) project.
