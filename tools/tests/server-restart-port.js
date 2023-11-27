import * as selftest from '../tool-testing/selftest';

selftest.define("server outputs port number on restarting", () => testHelper({
    path: "server/main.js",
    id: "server/main.js"
}));

function testHelper(server) {
  const s = new selftest.Sandbox();
  s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  let run = s.run("--port", "21000");
  run.match("Started proxy");
  run.waitSecs(15);

  run.match(server.id + " 0");

  s.write(server.path, s.read(server.path).replace(
    /module.id, (\d+)/,
    (match, n) => `module.id, ${ ++n }`,
  ));

  run.match("Meteor server restarted at: http://localhost:21000/");
}
