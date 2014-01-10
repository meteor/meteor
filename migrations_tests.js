Tinytest.add('Migrates up once and only once.', function(test) {
  var run = []; //keeps track of migrations in here
  Migrations._reset();

  // first one
  Migrations.add({up: function () {run.push('u1');}, version: 1});

  // migrates once
  Migrations.attempt('latest');
  test.equal(run, ['u1']);
  test.equal(Migrations.getVersion(), 1);

  // shouldn't do anything
  Migrations.attempt('latest');
  test.equal(run, ['u1']);
  test.equal(Migrations.getVersion(), 1);
});

Tinytest.add('Migrates up once and back down.', function(test) {
  var run = []; //keeps track of migrations in here
  Migrations._reset();

  // first one
  Migrations.add({
    up: function () {run.push('u1');},
    down: function () {run.push('d1');},
    version: 1
  });

  Migrations.attempt('latest');
  test.equal(run, ['u1']);
  test.equal(Migrations.getVersion(), 1);

  // shouldn't do anything
  Migrations.attempt('0');
  test.equal(run, ['u1', 'd1']);
  test.equal(Migrations.getVersion(), 0);
});

Tinytest.add('Migrates up several times.', function(test) {
  var run = []; //keeps track of migrations in here
  Migrations._reset();

  // first one
  Migrations.add({up: function () {run.push('u1');}, version: 1});

  // migrates once
  Migrations.attempt('latest');
  test.equal(run, ['u1']);
  test.equal(Migrations.getVersion(), 1);

  // add two more, out of order
  Migrations.add({up: function () {run.push('u4');}, version: 4});
  Migrations.add({up: function () {run.push('u3');}, version: 3});

  // should run the next two nicely in order
  Migrations.attempt('latest');
  test.equal(run, ['u1', 'u3', 'u4']);
  test.equal(Migrations.getVersion(), 4);
});

Tinytest.add('Tests migrating down', function(test) {
  var run = []; //keeps track of migrations in here
  Migrations._reset();

  // add the migrations
  Migrations.add({up: function () {run.push('u1');}, version: 1});
  Migrations.add({up: function () {run.push('u2');}, version: 2});
  Migrations.add({
    up: function () {run.push('u3');},
    down: function () {run.push('d3');},
    version: 3,
    name: 'Down Migration' //give it a name, just for shits
  });

  // migrates up
  Migrations.attempt('latest');
  test.equal(run, ['u1', 'u2', 'u3']);
  test.equal(Migrations.getVersion(), 3);

  // migrates down
  Migrations.attempt('2');
  test.equal(run, ['u1', 'u2', 'u3', 'd3']);
  test.equal(Migrations.getVersion(), 2);

  // should throw as migration u2 has no down method and remain at the save ver
  test.throws(function() {
    Migrations.attempt('1');
  }, /Cannot migrate/);
  test.equal(run, ['u1', 'u2', 'u3', 'd3']);
  test.equal(Migrations.getVersion(), 2);
});

Tinytest.add('Checks that locking works correctly', function(test) {
  var run = []; //keeps track of migrations in here
  Migrations._reset();

  // add the migrations
  Migrations.add({version: 1, up: function () {
    run.push('u1');

    // attempts a migration from within the migration, this should have no
    // effect due to locking
    Migrations.attempt('latest');
  }});

  // migrates up, should only migrate once
  Migrations.attempt('latest');
  test.equal(run, ['u1']);
  test.equal(Migrations.getVersion(), 1);
});

Tinytest.add('Does nothing for no migrations.', function(test) {
  Migrations._reset();

  // shouldnt do anything
  Migrations.attempt('latest');
  test.equal(Migrations.getVersion(), 0);
});
