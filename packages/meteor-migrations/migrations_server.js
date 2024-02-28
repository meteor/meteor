import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import { check, Match } from "meteor/check";
import { Log } from "meteor/logging";

/*
  Adds migration capabilities. Migrations are defined like:

  Migrations.add({
    up: function() {}, //*required* code to run to migrate upwards
    version: 1, //*required* number to identify migration order
    down: function() {}, //*optional* code to run to migrate downwards
    name: 'Something' //*optional* display name for the migration
  });

  The ordering of migrations is determined by the version you set.

  To run the migrations, set the MIGRATE environment variable to either
  'latest' or the version number you want to migrate to. Optionally, append
  ',exit' if you want the migrations to exit the meteor process, e.g if you're
  migrating from a script (remember to pass the --once parameter).

  e.g:
  MIGRATE="latest" mrt # ensure we'll be at the latest version and run the app
  MIGRATE="latest,exit" mrt --once # ensure we'll be at the latest version and exit
  MIGRATE="2,exit" mrt --once # migrate to version 2 and exit

  Note: Migrations will lock ensuring only 1 app can be migrating at once. If
  a migration crashes, the control record in the migrations collection will
  remain locked and at the version it was at previously, however the db could
  be in an inconsistent state.
*/

// since we'll be at version 0 by default, we should have a migration set for
// it.
const DefaultMigration = { version: 0, up: function () {} };

export const Migrations = {
  _list: [DefaultMigration],
  options: {
    // false disables logging
    log: true,
    // null or a function
    logger: null,
    // enable/disable info log "already at latest."
    logIfLatest: true,
    // migrations collection name
    collectionName: "migrations",
  },
  config: function (opts) {
    this.options = Object.assign({}, this.options, opts);
  },
};

/*
  Logger factory function. Takes a prefix string and options object
  and uses an injected `logger` if provided, else falls back to
  Meteor's `Log` package.
  Will send a log object to the injected logger, on the following form:
    message: String
    level: String (info, warn, error, debug)
    tag: 'Migrations'
*/
function createLogger(prefix) {
  check(prefix, String);

  // Return noop if logging is disabled.
  if (Migrations.options.log === false) {
    return function () {};
  }

  return function (level, message) {
    check(level, Match.OneOf("info", "error", "warn", "debug"));
    check(message, String);

    const logger = Migrations.options?.logger;

    if (logger && typeof logger === "function") {
      logger({
        level: level,
        message: message,
        tag: prefix,
      });
    } else {
      Log[level]({ message: prefix + ": " + message });
    }
  };
}

const getMigrationsCollection = () => {
  if (Migrations._collection) {
    return Migrations._collection;
  }
  Migrations._collection = new Mongo.Collection(Migrations.options.collectionName);
  return Migrations._collection;
};

let log;

Meteor.startup(async function () {
  const options = Migrations.options;

  log = createLogger("Migrations");

  ["info", "warn", "error", "debug"].forEach(function (level) {
    log[level] = (message) => log(level, message);
  });

  if (process.env.MIGRATE) {
    await Migrations.migrateTo(process.env.MIGRATE);
  }
});

// Add a new migration:
// {up: function *required
//  version: Number *required
//  down: function *optional
//  name: String *optional
// }
Migrations.add = function (migration) {
  if (typeof migration.up !== "function")
    throw new Meteor.Error("Migration must supply an up function.");

  if (typeof migration.version !== "number")
    throw new Meteor.Error("Migration must supply a version number.");

  if (migration.version <= 0)
    throw new Meteor.Error("Migration version must be greater than 0");

  // Freeze the migration object to make it hereafter immutable
  Object.freeze(migration);

  this._list.push(migration);
  this._list.sort((a, b) =>
    a.version > b.version ? 1 : b.version > a.version ? -1 : 0,
  );
};

// Attempts to run the migrations using command in the form of:
// e.g 'latest', 'latest,exit', 2
// use 'XX,rerun' to re-run the migration at that version
Migrations.migrateTo = async function (command) {
  if (
    typeof command === "undefined" ||
    command === "" ||
    this._list.length === 0
  ) {
    throw new Error("Cannot migrate using invalid command: " + command);
  }

  let version;
  let subcommand;
  if (typeof command === "number") {
    version = command;
  } else {
    version = command.split(",")[0]; //.trim();
    subcommand = command.split(",")[1]; //.trim();
  }

  if (version === "latest") {
    await this._migrateTo(this._list[this._list.length - 1].version);
  } else {
    await this._migrateTo(parseInt(version), subcommand === "rerun");
  }

  // remember to run meteor with --once otherwise it will restart
  if (subcommand === "exit") process.exit(0);
};

// just returns the current version
Migrations.getVersion = async function () {
  const control = await this._getControl();
  return control.version;
};

// migrates to the specific version passed in
Migrations._migrateTo = async function (version, rerun) {
  const self = this;
  const control = await this._getControl(); // Side effect: upserts control document.
  let currentVersion = control.version;

  //Avoid unneeded locking, check if migration actually is going to run
  if (!rerun && currentVersion === version) {
    if (Migrations.options.logIfLatest) {
      log.info("Not migrating, already at version " + version);
    }
    return;
  }

  if ((await lock()) === false) {
    log.info("Not migrating, control is locked.");
    return;
  }

  if (rerun) {
    log.info("Rerunning version " + version);
    await migrate("up", this._findIndexByVersion(version));
    log.info("Finished migrating.");
    await unlock();
    return;
  }

  const startIdx = this._findIndexByVersion(currentVersion);
  const endIdx = this._findIndexByVersion(version);

  // log.info('startIdx:' + startIdx + ' endIdx:' + endIdx);
  log.info(
    "Migrating from version " +
      this._list[startIdx].version +
      " -> " +
      this._list[endIdx].version,
  );

  // run the actual migration
  async function migrate(direction, idx) {
    const migration = self._list[idx];

    if (typeof migration[direction] !== "function") {
      await unlock();
      throw new Meteor.Error(
        "Cannot migrate " + direction + " on version " + migration.version,
      );
    }

    function maybeName() {
      return migration.name ? " (" + migration.name + ")" : "";
    }

    log.info(
      "Running " +
        direction +
        "() on version " +
        migration.version +
        maybeName(),
    );

    await migration[direction](migration);
  }

  // Returns true if lock was acquired.
  async function lock() {
    // This is atomic. The selector ensures only one caller at a time will see
    // the unlocked control, and locking occurs in the same update's modifier.
    // All other simultaneous callers will get false back from the update.
    return (
      (await getMigrationsCollection().updateAsync(
        { _id: "control", locked: false },
        { $set: { locked: true, lockedAt: new Date() } },
      )) === 1
    );
  }

  // Side effect: saves version.
  async function unlock() {
    await self._setControl({ locked: false, version: currentVersion });
  }

  async function updateVersion() {
    await self._setControl({ locked: true, version: currentVersion });
  }

  if (currentVersion < version) {
    for (let i = startIdx; i < endIdx; i++) {
      await migrate("up", i + 1);
      currentVersion = self._list[i + 1].version;
      await updateVersion();
    }
  } else {
    for (let i = startIdx; i > endIdx; i--) {
      await migrate("down", i);
      currentVersion = self._list[i - 1].version;
      await updateVersion();
    }
  }

  await unlock();
  log.info("Finished migrating.");
};

// gets the current control record, optionally creating it if non-existent
Migrations._getControl = async function () {
  const control = await getMigrationsCollection().findOneAsync({ _id: "control" });

  if (control) {
    return control;
  }

  return this._setControl({ version: 0, locked: false });
};

// sets the control record
Migrations._setControl = async function (control) {
  // be quite strict
  check(control.version, Number);
  check(control.locked, Boolean);

  await getMigrationsCollection().updateAsync(
    { _id: "control" },
    { $set: { version: control.version, locked: control.locked } },
    { upsert: true },
  );

  return control;
};

// returns the migration index in _list or throws if not found
Migrations._findIndexByVersion = function (version) {
  for (let i = 0; i < this._list.length; i++) {
    if (this._list[i].version === version) return i;
  }

  throw new Meteor.Error("Can't find migration version " + version);
};

//reset (mainly intended for tests)
Migrations._reset = async function () {
  // to force the test to await the version to be updated in the db
  await this.getVersion();
  this._list = [{ version: 0, up: function () {} }];
  await getMigrationsCollection().removeAsync({});
};

// unlock control
Migrations.unlock = async function () {
  await getMigrationsCollection().updateAsync({ _id: "control" }, { $set: { locked: false } });
};
