import selftest, {Sandbox} from '../tool-testing/selftest.js';

selftest.define('custom minifier - devel vs prod', async function (options) {
  const s = new Sandbox({
    clients: options.clients
  });
  await s.init();

  await s.createApp('myapp', 'custom-minifier');
  s.cd('myapp');

  await s.testWithAllClients(async function (run) {
    run.waitSecs(20);
    await run.match('myapp');
    await run.match('proxy');

    run.connectClient();
    run.waitSecs(4800);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    await run.match('Message: foo');

    await run.match('production_css: rgb(255, 0, 0)');
    await run.match('development_css: rgb(0, 0, 0)');
    await run.match('minified_lazy: rgb(0, 255, 0)');
    await run.match('Message (client): production_js');

    await run.stop();
  }, { args: ['--production'],
    testName: 'custom minifier - devel vs prod - part 1',
    testFile: 'customer-minifier.js' });

  await s.testWithAllClients(async function (run) {
    run.waitSecs(20);
    await run.match('myapp');
    await run.match('proxy');

    run.connectClient();
    run.waitSecs(250);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    await run.match('Message: foo');

    await run.match('production_css: rgb(0, 0, 0)');
    await run.match('development_css: rgb(255, 0, 0)');
    await run.match('minified_lazy: rgb(0, 255, 0)');
    await run.match('Message (client): development_js');

    await run.stop();
  },{
    testName:'custom minifier - devel vs prod - part 2',
    testFile: 'custom-minifier.js'});
});
