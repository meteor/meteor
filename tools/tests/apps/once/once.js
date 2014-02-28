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
  var test = new Meteor.Collection('test');
  test.insert({ value: 86 });
  process.exit(test.findOne().value);
}
