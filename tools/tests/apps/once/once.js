process.stdout.write("once test\n");

if (process.env.RUN_ONCE_OUTCOME === "exit")
  process.exit(123);

if (process.env.RUN_ONCE_OUTCOME === "kill") {
  process.kill(process.pid, 'SIGKILL');
}

if (process.env.RUN_ONCE_OUTCOME === "hang") {
  // The outstanding timeout will prevent node from exiting
  setTimeout(function () {}, 365 * 24 * 60 * 60);
}

if (process.env.RUN_ONCE_OUTCOME === "mongo") {
  var test = new Mongo.Collection('test');
  var triesLeft = 10;

  async function tryInsert() {
    try {
      await test.insertAsync({ value: 86 });
    } catch (e) {
      if (--triesLeft <= 0) {
        throw e;
      }

      console.log("insert failed; retrying:", String(e.stack || e));
      Meteor.setTimeout(tryInsert, 1000);
      return;
    }

    process.exit((await test.findOneAsync()).value);
  }

  Meteor.startup(tryInsert);
}
