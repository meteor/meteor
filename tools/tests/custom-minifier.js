import selftest, {Sandbox} from '../tool-testing/selftest.js';

selftest.define('custom minifier - devel vs prod', function (options) {
  const s = new Sandbox({
    clients: options.clients
  });

  s.createApp('myapp', 'custom-minifier');
  s.cd('myapp');

  s.testWithAllClients(function (run) {
    run.waitSecs(20);
    run.match('myapp');
    run.match('proxy');

    run.connectClient();
    run.waitSecs(4800);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    run.match('Message: foo');

    run.match('production_css: rgb(255, 0, 0)');
    run.match('development_css: rgb(0, 0, 0)');
    run.match('minified_lazy: rgb(0, 255, 0)');
    run.match('Message (client): production_js');

    run.stop();
  }, { args: ['--production'],
    testName: 'custom minifier - devel vs prod - part 1',
    testFile: 'customer-minifier.js' });

  s.testWithAllClients(function (run) {
    run.waitSecs(20);
    run.match('myapp');
    run.match('proxy');

    run.connectClient();
    run.waitSecs(250);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    run.match('Message: foo');

    run.match('production_css: rgb(0, 0, 0)');
    run.match('development_css: rgb(255, 0, 0)');
    run.match('minified_lazy: rgb(0, 255, 0)');
    run.match('Message (client): development_js');

    run.stop();
  },{
    testName:'custom minifier - devel vs prod - part 2',
    testFile: 'custom-minifier.js'});
});
