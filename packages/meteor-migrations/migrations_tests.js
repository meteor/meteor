import { Migrations } from "./migrations_server";

// Not sure why but without this it was saying migrations was already defined
Migrations.options.collectionName = 'test_migrations';

Tinytest.addAsync("Sync Migrations - Migrates up once and only once.", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // first one
  Migrations.add({
    up: function () {
      run.push("u1");
    },
    version: 1,
  });

  // migrates once
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // shouldn't do anything
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);
});

Tinytest.addAsync("Sync Migrations - Migrates up once and back down.", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // first one
  Migrations.add({
    up: function () {
      run.push("u1");
    },
    down: function () {
      run.push("d1");
    },
    version: 1,
  });

  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // shouldn't do anything
  await Migrations.migrateTo("0");
  test.equal(run, ["u1", "d1"]);
  test.equal(await Migrations.getVersion(), 0);
});

Tinytest.addAsync("Sync Migrations - Migrates up several times.", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // first one
  Migrations.add({
    up: function () {
      run.push("u1");
    },
    version: 1,
  });

  // migrates once
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // add two more, out of order
  Migrations.add({
    up: function () {
      run.push("u4");
    },
    version: 4,
  });
  Migrations.add({
    up: function () {
      run.push("u3");
    },
    version: 3,
  });

  // should run the next two nicely in order
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1", "u3", "u4"]);
  test.equal(await Migrations.getVersion(), 4);
});

Tinytest.addAsync("Sync Migrations - Tests migrating down", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // add the migrations
  Migrations.add({
    up: function () {
      run.push("u1");
    },
    version: 1,
  });
  Migrations.add({
    up: function () {
      run.push("u2");
    },
    version: 2,
  });
  Migrations.add({
    up: function () {
      run.push("u3");
    },
    down: function () {
      run.push("d3");
    },
    version: 3,
    name: "Down Migration", //give it a name, just for shits
  });

  // migrates up
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1", "u2", "u3"]);
  test.equal(await Migrations.getVersion(), 3);

  // migrates down
  await Migrations.migrateTo("2");
  test.equal(run, ["u1", "u2", "u3", "d3"]);
  test.equal(await Migrations.getVersion(), 2);

  // should throw as migration u2 has no down method and remain at the save ver
  await test.throwsAsync(async function () {
    await Migrations.migrateTo("1");
  }, /Cannot migrate/);
  test.equal(run, ["u1", "u2", "u3", "d3"]);
  test.equal(await Migrations.getVersion(), 2);
});

Tinytest.addAsync("Sync Migrations - Tests migrating down to version 0", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  test.equal(await Migrations.getVersion(), 0);

  Migrations.add({
    up: function () {
      run.push("u1");
    },
    down: function () {
      run.push("d1");
    },
    version: 1,
  });

  // migrates up
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // migrates down
  await Migrations.migrateTo(0);
  test.equal(run, ["u1", "d1"]);
  test.equal(await Migrations.getVersion(), 0);
});

Tinytest.addAsync("Sync Migrations - Checks that locking works correctly", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // add the migrations
  Migrations.add({
    version: 1,
    up: async function () {
      run.push("u1");

      // attempts a migration from within the migration, this should have no
      // effect due to locking
      await Migrations.migrateTo("latest");
    },
  });

  // migrates up, should only migrate once
  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);
});

Tinytest.addAsync(
  "Sync Migrations - Checks that version is updated if subsequent migration fails",
  async function (test) {
    const run = [];
    let shouldError = true;
    await Migrations._reset();

    // add the migrations
    Migrations.add({
      version: 1,
      up: function () {
        run.push("u1");
      },
    });
    Migrations.add({
      version: 2,
      up: function () {
        if (shouldError) {
          throw new Error("Error in migration");
        }
        run.push("u2");
      },
    });

    // migrate up, which should throw
    await test.throwsAsync(async function () {
      await Migrations.migrateTo("latest");
    });
    test.equal(run, ["u1"]);
    test.equal(await Migrations.getVersion(), 1);

    shouldError = false;
    // migrate up again, should succeed
    await Migrations.unlock();
    await Migrations.migrateTo("latest");
    test.equal(run, ["u1", "u2"]);
    test.equal(await Migrations.getVersion(), 2);
  },
);

Tinytest.addAsync("Sync Migrations - Does nothing for no migrations.", async function (test) {
  await Migrations._reset();

  // shouldnt do anything
  await Migrations.migrateTo("latest");
  test.equal(await Migrations.getVersion(), 0);
});

Tinytest.addAsync("Sync Migrations - Checks that rerun works correctly", async function (test) {
  const run = []; //keeps track of migrations in here
  await Migrations._reset();

  // add the migrations
  Migrations.add({
    version: 1,
    up: function () {
      run.push("u1");
    },
  });

  await Migrations.migrateTo("latest");
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // shouldn't migrate
  await Migrations.migrateTo(1);
  test.equal(run, ["u1"]);
  test.equal(await Migrations.getVersion(), 1);

  // should migrate again
  await Migrations.migrateTo("1,rerun");
  test.equal(run, ["u1", "u1"]);
  test.equal(await Migrations.getVersion(), 1);
});

Tinytest.addAsync(
  "Sync Migrations - Checks that rerun works even if there are missing versions",
  async function (test) {
    const run = []; //keeps track of migrations in here
    await Migrations._reset();

    // add the migration with a missing step
    Migrations.add({
      version: 3,
      up: function () {
        run.push("u1");
      },
    });

    await Migrations.migrateTo("latest");
    test.equal(run, ["u1"]);
    test.equal(await Migrations.getVersion(), 3);

    // shouldn't migrate
    await Migrations.migrateTo(3);
    test.equal(run, ["u1"]);
    test.equal(await Migrations.getVersion(), 3);

    // should migrate again
    await Migrations.migrateTo("3,rerun");
    test.equal(run, ["u1", "u1"]);
    test.equal(await Migrations.getVersion(), 3);
  },
);

Tinytest.addAsync(
  "Sync Migrations - Migration callbacks include the migration as an argument",
  async function (test) {
    let contextArg;
    await Migrations._reset();

    // add the migrations
    const migration = {
      version: 1,
      up: function (m) {
        contextArg = m;
      },
    };
    Migrations.add(migration);

    await Migrations.migrateTo(1);
    test.equal(contextArg === migration, true);
  },
);

Tinytest.addAsync(
  "Sync Migrations - Migrations can log to injected logger",
  async function (test, done) {
    await Migrations._reset();

    // Ensure this logging code only runs once. More than once and we get
    // Tinytest errors that the test "returned multiple times", or "Trace: event
    // after complete!". Give me a ping, Vasili. One ping only, please.
    let calledDone = false;
    Migrations.options.logger = function () {
      if (!calledDone) {
        calledDone = true;
        test.isTrue(true);
        done();
      }
    };

    Migrations.add({ version: 1, up: function () {} });
    await Migrations.migrateTo(1);

    Migrations.options.logger = null;
  },
);

Tinytest.addAsync(
  "Sync Migrations - Migrations should pass correct arguments to logger",
  async function (test, done) {
    await Migrations._reset();

    // Ensure this logging code only runs once. More than once and we get
    // Tinytest errors that the test "returned multiple times", or "Trace: event
    // after complete!". Give me a ping, Vasili. One ping only, please.
    let calledDone = false;

    Migrations.options.logger = function (opts) {
        if (!calledDone) {
            calledDone = true;
            test.include(opts, "level");
            test.include(opts, "message");
            test.include(opts, "tag");
            test.equal(opts.tag, "Migrations");
            done();
        }
    };

    Migrations.add({ version: 1, up: function () {} });
    await Migrations.migrateTo(1);

    Migrations.options.logger = null;
  },
);

Tinytest.addAsync("Async Migrations - Migrates up once and only once.", async function (test) {
    const run = []; //keeps track of migrations in here
    await Migrations._reset();

    // first one
    Migrations.add({
        up: async function () {
            run.push("u1");
        },
        version: 1,
    });

    // migrates once
    await Migrations.migrateTo("latest");
    test.equal(run, ["u1"]);
    test.equal(await Migrations.getVersion(), 1);

    // shouldn't do anything
    await Migrations.migrateTo("latest");
    test.equal(run, ["u1"]);
    test.equal(await Migrations.getVersion(), 1);
});

Tinytest.addAsync(
    "Async Migrations - Checks that version is updated if subsequent migration fails",
    async function (test) {
        const run = [];
        let shouldError = true;
        await Migrations._reset();

        // add the migrations
        Migrations.add({
            version: 1,
            up: async function () {
                run.push("u1");
            },
        });
        Migrations.add({
            version: 2,
            up: async function () {
                if (shouldError) {
                    throw new Error("Error in migration");
                }
                run.push("u2");
            },
        });

        // migrate up, which should throw
        await test.throwsAsync(async function () {
            await Migrations.migrateTo("latest");
        });
        test.equal(run, ["u1"]);
        test.equal(await Migrations.getVersion(), 1);
        const control = await Migrations._getControl();
        test.equal(control.locked, true);

        shouldError = false;
        // migrate up again, should succeed
        await Migrations.unlock();
        await Migrations.migrateTo("latest");
        test.equal(run, ["u1", "u2"]);
        test.equal(await Migrations.getVersion(), 2);
    },
);
