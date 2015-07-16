import selftest, {Sandbox} from '../selftest.js';

selftest.define('standard-minifiers - CSS splitting', function (options) {
  const s = new Sandbox({
    clients: options.clients
  });

  s.createApp('myapp', 'minification-css-splitting');
  s.cd('myapp');

  s.testWithAllClients(function (run) {
    run.waitSecs(5);
    run.match("myapp");
    run.match("proxy");
    run.match("MongoDB");
    run.match("your app");
    run.match("running at");
    run.match("localhost");

    run.connectClient();
    run.waitSecs(20);

    run.match('the number of stylesheets: <2>');
    run.match('the color of the tested 4097th property: <rgb(0, 128, 0)>');

    s.append('client/lots-of-styles.main.styl', `
  .class-4097
    color: blue
  `);

    run.waitSecs(40);
    run.match("Client modified -- refreshing");
    run.match('the number of stylesheets: <2>');
    run.match('the color of the tested 4097th property: <rgb(0, 0, 128)>');

    run.stop();
  }, '--production');
});
