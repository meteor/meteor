import selftest, {Sandbox} from '../tool-testing/selftest.js';

selftest.define('custom minifier - devel vs prod', function (options) {
  const s = new Sandbox({
    clients: options.clients
  });

  s.createApp('myapp', 'custom-minifier');
  s.cd('myapp');

  s.testWithAllClients(function (run) {
    run.waitSecs(5);
    run.match('myapp');
    run.match('proxy');
    run.match('MongoDB');

    run.connectClient();
    run.waitSecs(20);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    run.match('Message: foo');

    run.match('production_css: rgb(255, 0, 0)');
    run.match('development_css: rgb(0, 0, 0)');
    run.match('Message (client): production_js');

    run.stop();
  }, '--production');

  s.testWithAllClients(function (run) {
    run.waitSecs(5);
    run.match('myapp');
    run.match('proxy');
    run.match('MongoDB');

    run.connectClient();
    run.waitSecs(20);

    // XXX when minifiers start getting applied to server target, this
    // outcome would change
    run.match('Message: foo');

    run.match('production_css: rgb(0, 0, 0)');
    run.match('development_css: rgb(255, 0, 0)');
    run.match('Message (client): development_js');

    run.stop();
  }/*, development*/);
});
