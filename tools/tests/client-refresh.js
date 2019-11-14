import * as selftest from '../tool-testing/selftest.js';

selftest.define("client refresh for package code", () => testHelper({
  client: {
    path: "packages/test-package/client.js",
    id: "/node_modules/meteor/test-package/client.js",
  },
  server: {
    path: "packages/test-package/server.js",
    id: "/node_modules/meteor/test-package/server.js",
  },
  both: {
    path: "packages/test-package/both.js",
    id: "/node_modules/meteor/test-package/both.js",
  },
}));

selftest.define("client refresh for application code", () => testHelper({
  client: {
    path: "client/main.js",
    id: "/client/main.js",
  },
  server: {
    path: "server/main.js",
    id: "/server/main.js",
  },
  both: {
    path: "imports/both.js",
    id: "/imports/both.js",
  },
}));

selftest.define("client refresh for non-npm node_modules", () => testHelper({
  client: {
    path: "client/main.js",
    id: "/client/main.js",
  },
  server: {
    path: "server/main.js",
    id: "/server/main.js",
  },
  both: {
    path: "imports/node_modules/some-package/index.js",
    id: "/imports/node_modules/some-package/index.js",
  },
}));

function testHelper(pathsAndIds) {
  const s = new selftest.Sandbox();
  s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  let run = s.run();
  run.match("Started proxy");
  run.waitSecs(15);

  run.match(pathsAndIds.both.id + " 0");
  run.match(pathsAndIds.server.id + " 0");

  function checkClientRefresh() {
    run.match("Client modified -- refreshing");
  }

  function checkServerRestart(counts) {
    run.match("Server modified -- restarting");
    if (typeof counts.both === "number") {
      run.match(pathsAndIds.both.id + " " + counts.both);
    }
    if (typeof counts.server === "number") {
      run.match(pathsAndIds.server.id + " " + counts.server);
    }
    run.match("Meteor server restarted");
  }

  increment(s, pathsAndIds.client.path);
  checkClientRefresh();

  increment(s, pathsAndIds.server.path);
  checkServerRestart({
    both: 0,
    server: 1,
  });

  increment(s, pathsAndIds.both.path);
  checkServerRestart({
    both: 1,
    server: 1,
  });

  increment(s, pathsAndIds.client.path);
  checkClientRefresh();

  s.write(
    pathsAndIds.server.path,
    // Comment out the import of ./both in the server file:
    s.read(pathsAndIds.server.path).replace(/\bimport\b/, '//import'),
  );
  checkServerRestart({
    server: 1,
  });

  increment(s, pathsAndIds.server.path);
  checkServerRestart({
    server: 2,
  });

  increment(s, pathsAndIds.both.path);
  checkClientRefresh();

  increment(s, pathsAndIds.client.path);
  checkClientRefresh();

  s.write(
    pathsAndIds.server.path,
    // Uncomment the import of ./both in the server file:
    s.read(pathsAndIds.server.path).replace(/\/\/import\b/, 'import'),
  );
  checkServerRestart({
    both: 2,
    server: 2,
  });

  increment(s, pathsAndIds.both.path);
  checkServerRestart({
    both: 3,
    server: 2,
  });

  increment(s, pathsAndIds.server.path);
  checkServerRestart({
    both: 3,
    server: 3,
  });

  increment(s, pathsAndIds.client.path);
  checkClientRefresh();
}

function increment(s, path) {
  s.write(path, s.read(path).replace(
    /module.id, (\d+)/,
    (match, n) => `module.id, ${ ++n }`,
  ));
}
