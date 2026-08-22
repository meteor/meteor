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

selftest.define("client refresh names the changed file when verbose", async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  // METEOR_PROFILE is one of the two switches runLog.logClientRestart honours;
  // the other is meteor.verbose / meteor.modern.verbose in package.json.
  s.set("METEOR_PROFILE", "1");

  const run = s.run();
  await run.match("Started proxy");
  run.waitSecs(30);

  await run.match("/imports/both.js 0");
  await run.match("/server/main.js 0");

  // The point of the flag: say which file caused the refresh, not just that one
  // happened. The watcher reports an absolute path, so match on the tail.
  increment(s, "client/main.js");
  await run.match(/Client modified -- refreshing.*client\/main\.js/);

  await run.stop();
});

selftest.define("client refresh stays quiet without a verbose switch", async () => {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  // Must be unset, not "0": the repo reads METEOR_PROFILE with `!!`, so the
  // string "0" is truthy and would switch verbose ON. See profile.ts and
  // isMeteorAppProfile() in packages/tools-core/lib/meteor.js.
  s.unset("METEOR_PROFILE");

  const run = s.run();
  await run.match("Started proxy");
  run.waitSecs(30);

  await run.match("/imports/both.js 0");
  await run.match("/server/main.js 0");

  // Default feedback must stay minimal: the bare line, no path appended. Guards
  // the default that nachocodoner asked us to protect.
  increment(s, "client/main.js");
  await run.match("Client modified -- refreshing");
  selftest.expectFalse(
    /Client modified -- refreshing.*client\/main\.js/.test(
      run.getMatcherFullBuffer()
    )
  );

  await run.stop();
});

async function testHelper(pathsAndIds) {
  const s = new selftest.Sandbox();
  await s.init();

  await s.createApp("myapp", "client-refresh");
  s.cd("myapp");

  let run = s.run();
  await run.match("Started proxy");
  run.waitSecs(15);

  await run.match(pathsAndIds.both.id + " 0");
  await run.match(pathsAndIds.server.id + " 0");

  function checkClientRefresh() {
    return run.match("Client modified -- refreshing");
  }

  async function checkServerRestart(counts) {
    await run.match("Server modified -- restarting");
    if (typeof counts.both === "number") {
      await run.match(pathsAndIds.both.id + " " + counts.both);
    }
    if (typeof counts.server === "number") {
      await run.match(pathsAndIds.server.id + " " + counts.server);
    }
    await run.match("Meteor server restarted");
  }

  increment(s, pathsAndIds.client.path);
  await checkClientRefresh();

  increment(s, pathsAndIds.server.path);
  await checkServerRestart({
    both: 0,
    server: 1,
  });

  increment(s, pathsAndIds.both.path);
  await checkServerRestart({
    both: 1,
    server: 1,
  });

  increment(s, pathsAndIds.client.path);
  await checkClientRefresh();

  s.write(
    pathsAndIds.server.path,
    // Comment out the import of ./both in the server file:
    s.read(pathsAndIds.server.path).replace(/\bimport\b/, '//import'),
  );
  await checkServerRestart({
    server: 1,
  });

  increment(s, pathsAndIds.server.path);
  await checkServerRestart({
    server: 2,
  });

  increment(s, pathsAndIds.both.path);
  await checkClientRefresh();

  increment(s, pathsAndIds.client.path);
  await checkClientRefresh();

  s.write(
    pathsAndIds.server.path,
    // Uncomment the import of ./both in the server file:
    s.read(pathsAndIds.server.path).replace(/\/\/import\b/, 'import'),
  );
  await checkServerRestart({
    both: 2,
    server: 2,
  });

  increment(s, pathsAndIds.both.path);
  await checkServerRestart({
    both: 3,
    server: 2,
  });

  increment(s, pathsAndIds.server.path);
  await checkServerRestart({
    both: 3,
    server: 3,
  });

  increment(s, pathsAndIds.client.path);
  await checkClientRefresh();
}

function increment(s, path) {
  s.write(path, s.read(path).replace(
    /module.id, (\d+)/,
    (match, n) => `module.id, ${ ++n }`,
  ));
}
