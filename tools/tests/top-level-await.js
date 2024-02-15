import * as selftest from '../tool-testing/selftest.js';


selftest.define("xxxx top level await - order", async function (options) {
  const s = new selftest.Sandbox({
    clients: options.clients
  });
  s.set('METEOR_ENABLE_CLIENT_TOP_LEVEL_AWAIT', 'true');
  await s.init();

  await s.createApp("myapp", "top-level-await-order");
  s.cd("myapp");

  await s.testWithAllClients(async (run) => {
    // TODO: Startup should be the last log, but there is a bug
    // where it runs too early in plugins
    await run.match('plugin - startup');
    await run.match('plugin - before');
    await run.match('plugin - after');
    await run.match('plugin - later');

    await run.match('plugin without Meteor');

    const lines = [
      'package sync',
      'package 1 - b before',
      'package 2 - b',
      'package 2 - a before',
      'package sync - later',
      'package 1 - b after',
      'package 2 - b later',
      'package 2 - a after',
      'package 1 - b later',
      'package 1 - a before',
      'package 2 - a later',
      'package 1 - a after',
      'package 1 - a later',
      'app a.js - before',
      'app b.js - before',
      'app a.js - after',
      'app b.js - after',
      'app a.js - later',
      'app b.js - later',
      'entry - before',
      'entry - after',
      'lazy package',
      'package 2 value 6',
      'entry - later',
      'after lazy',
      'lazy package value 10',
      'entry - startup',
    ];

    for(const line of lines) {
      await run.match(line);
    }

    await run.connectClient();

    for(const line of lines) {
      await run.match(`[client] ${line}`);
    }

    await run.stop();
  }, {
    // concatenate js files so packages load in parallel
    // otherwise, there is too much of a delay between each
    // package loading
    // TODO: we could instead create a custom minifier for this test that 
    // only concatenates, which would be faster
    args: ['--production']
  });
});
