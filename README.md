# Meteor Migrations

A simple migration system for [Meteor](http://meteor.com) supporting up/downwards migrations and command line usage.

## Installation

Meteor Migrations can be installed with [Meteorite](https://github.com/oortcloud/meteorite/). From inside a Meteorite-managed app:

``` sh
$ mrt add percolatestudio-migrations
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

**NOTE**: You cannot create your own migration at version 0. This version is reserved by migrations for a 'vanilla' system, that is, one without any migrations applied.

### Command line use

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

## Contributing

Write some code. Write some tests. To run the tests, do:

``` sh
$ mrt test-packages percolatestudio-migrations
```

## License 

MIT. (c) Percolate Studio

Meteor Migrations was developed as part of the [Verso](http://versoapp.com) project.