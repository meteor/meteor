import * as selftest from '../tool-testing/selftest';

selftest.define("server outputs port number on restarting", () => testHelper({
    path: "server/main.js",
    id: "server/main.js"
}));

async function testHelper(server) {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  let run = s.run("--port", "21000");
  await run.match("Started proxy");
  run.waitSecs(15);

  await run.match(server.id + " 0");

  s.write(server.path, s.read(server.path).replace(
    /module.id, (\d+)/,
    (match, n) => `module.id, ${ ++n }`,
  ));

  await run.match("Meteor server restarted at: http://localhost:21000/");
}
