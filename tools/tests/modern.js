var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;
var files = require('../fs/files');

// No need for a high value since the asserts already wait long enough to pass tests
const waitToStart = 5;

async function writeModernConfig(s, modernConfig) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    ...json.meteor,
    modern: modernConfig,
  };

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

selftest.define("modern build stack - legacy", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = 'false';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");

  await writeModernConfig(s, false);

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* check legacy stack */
  await run.match(/Babel\.compile/, false, true);
  await run.match(/safeWatcher\.watchLegacy/, false, true);
  await run.match(/_findSources for web\.browser.legacy/, false, true);

  /* check debug stack */
  await run.match(/server\/main\.js:6:22/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");

  await writeModernConfig(s, true);

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* check modern stack */
  await run.match(/SWC\.compile/, false, true);
  await run.match(/safeWatcher\.watchModern/, false, true);
  await run.match(/_findSources for web\.browser/, false, true);

  run.forbid(/Babel\.compile/, false, true);
  run.forbid(/_findSources for web\.browser\.legacy/, false, true);

  /* check debug stack */
  await run.match(/server\/main\.js:6:22/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - disable transpiler", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");

  await writeModernConfig(s, { transpiler: false });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* disable transpiler */
  run.forbid(/SWC\.compile/, false, true);
  await run.match(/Babel\.compile/, false, true);

  /* Keep rest of modern build stack */
  await run.match(/safeWatcher\.watchModern/, false, true);
  await run.match(/_findSources for web\.browser/, false, true);
  run.forbid(/_findSources for web\.browser\.legacy/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - disable watcher", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");

  await writeModernConfig(s, { watcher: false });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* disable watcher */
  run.forbid(/safeWatcher\.watchModern/, false, true);
  await run.match(/safeWatcher\.watchLegacy/, false, true);

  /* Keep rest of modern build stack */
  await run.match(/SWC\.compile/, false, true);
  await run.match(/_findSources for web\.browser/, false, true);
  run.forbid(/_findSources for web\.browser\.legacy/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - disable webArchOnly", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");

  await writeModernConfig(s, { webArchOnly: false });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* disable webArchOnly */
  await run.match(/_findSources for web\.browser/, false, true);
  await run.match(/_findSources for web\.browser\.legacy/, false, true);

  /* Keep rest of modern build stack */
  await run.match(/safeWatcher\.watchModern/, false, true);
  await run.match(/SWC\.compile/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - transpiler boolean-like options", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  process.env.METEOR_DISABLE_COLORS = true;

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
    },
  });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* check verbose logs */
  await run.match(/SWC Config/, false, true);
  await run.match(/SWC Legacy Config/, false, true);
  await run.match(/Meteor Config/, false, true);

  /* check transpiler options */
  await run.match(/\[Transpiler] Used SWC.*\(app\)/, false, true);
  await run.match(/\[Transpiler] Used SWC.*\(package\)/, false, true);

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
      excludeApp: true,
    },
  });
  await run.match(/\[Transpiler] Used Babel.*\(app\)/, false, true);

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
      excludePackages: true,
    },
  });
  await run.match(/\[Transpiler] Used Babel.*\(package\)/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - transpiler string-like options", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  process.env.METEOR_DISABLE_COLORS = true;

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
    },
  });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* check verbose logs */
  await run.match(/SWC Config/, false, true);
  await run.match(/SWC Legacy Config/, false, true);
  await run.match(/Meteor Config/, false, true);

  /* check transpiler options */
  await run.match(/\[Transpiler] Used SWC.*\(app\)/, false, true);
  await run.match(/\[Transpiler] Used SWC.*\(package\)/, false, true);

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
      excludeApp: ['main.js'],
    },
  });
  await run.match(/\[Transpiler] Used Babel.*\(app\)/, false, true);

  await writeModernConfig(s, {
    transpiler: {
      verbose: true,
      excludePackages: ['ejson'],
    },
  });
  await run.match(/\[Transpiler] Used Babel.*\(package\)/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

async function writeConfig(s, config) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    ...json.meteor,
    ...config,
  };

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

async function writeSwcrcConfig(s, config) {
  let json = JSON.parse(s.read("package.json"));
  json = {
    ...json,
    ...config,
  };
  s.write(".swcrc", JSON.stringify(json, null, 2) + "\n");
}

async function writeSwcConfigJs(s, config) {
  // Create a JavaScript file that exports the configuration
  const jsContent = `module.exports = ${JSON.stringify(config, null, 2)};`;
  s.write("swc.config.js", jsContent);
}

selftest.define("modern build stack - transpiler custom .swcrc", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/alias.js',
    },
  });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* custom .swcrc and alias resolution */
  await run.match(/alias resolved/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - transpiler custom swc.config.js", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  // Remove the .swcrc file to ensure we're using swc.config.js
  s.unlink(".swcrc");

  // Write the swc.config.js file with the same configuration
  await writeSwcConfigJs(s, {
    jsc: {
      baseUrl: "./",
      paths: {
        "@swcAlias/*": ["swcAlias/*"]
      }
    }
  });

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/alias.js',
    },
  });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  /* custom swc.config.js and alias resolution */
  await run.match(/alias resolved/, false, true);

  await run.stop();

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - transpiler files", async function () {
  process.env.METEOR_MODERN = 'true';
  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/javascript.js',
    },
  });

  const run = s.run();

  run.waitSecs(waitToStart);
  await run.match("App running at");

  await run.match(/javascript\.js/, false, true);

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/javascript-component.jsx',
    },
  });
  await run.match(/javascript-component\.jsx/, false, true);

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/typescript.ts',
    },
  });
  await run.match(/typescript\.ts/, false, true);

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/typescript-component.tsx',
    },
  });
  await run.match(/typescript-component\.tsx/, false, true);

  await writeSwcrcConfig(s, {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: true,
        jsx: true,
      },
    },
  });
  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/custom-component.js',
    },
  });
  await run.match(/custom-component\.js/, false, true);

  await run.stop();

});

selftest.define("modern build stack - test terser minifier", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';
  const s = new Sandbox();  
  await s.init();

  const appName = "terser-app";

  await s.createApp(appName, "modern");
  await s.cd(appName);

  await writeConfig(s, {
    modern: false
  });

  s.set("NODE_INSPECTOR_IPC", "1");

  const runTerser = s.run();
  runTerser.waitSecs(waitToStart);
  await runTerser.match("App running at");
  await runTerser.stop();

  const buildTerser = s.run("build", `../${appName}`);
  buildTerser.waitSecs(60);
  await buildTerser.match("[DEBUG] Minifying using Terser", false, true);

  const terserBuildPath = files.pathJoin(s.cwd, `../${appName}`);
  selftest.expectEqual(files.exists(terserBuildPath), true);

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - test swc minifier", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = 'true';
  const s = new Sandbox();
  await s.init();

  const appName = "modern-swc";

  await s.createApp(appName, "modern");
  await s.cd(appName);

  await writeConfig(s, {
    modern: true,
    mainModule: {
      client: 'client/main.js',
      server: 'server/main.js',
    },
  });

  s.set("NODE_INSPECTOR_IPC", "1");

  await writeModernConfig(s, {
    minifier: true
  });

  const runSwc = s.run();
  runSwc.waitSecs(waitToStart);
  await runSwc.match("App running at");
  await runSwc.stop();

  const buildSwc = s.run("build", `../${appName}`);
  buildSwc.waitSecs(60);
  await buildSwc.match("[DEBUG] Minifying using SWC", false, true);

  // Check what's in the build directory
  const swcBuildPath = files.pathJoin(s.cwd, `../${appName}`);
  selftest.expectEqual(files.exists(swcBuildPath), true);

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - enable build", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");
  s.set("NODE_INSPECTOR_IPC", "1");

  await writeModernConfig(s, true);

  const buildSwc = s.run("build", `../modern`);
  buildSwc.waitSecs(waitToStart);

  /* Perserve legacy and modern on build */
  await buildSwc.match(/_findSources for web\.browser/, false, true);
  await buildSwc.match(/_findSources for web\.browser\.legacy/, false, true);

  /* Keep rest of modern build stack */
  await buildSwc.match(/safeWatcher\.watchModern/, false, true);
  await buildSwc.match(/SWC\.compile/, false, true);
  await buildSwc.match("[DEBUG] Minifying using SWC", false, true);

  process.env.METEOR_MODERN = currentMeteorModern;
});

selftest.define("modern build stack - disable build", async function () {
  const currentMeteorModern = process.env.METEOR_MODERN;
  process.env.METEOR_MODERN = '';

  const s = new Sandbox();
  await s.init();

  await s.createApp("modern", "modern");
  await s.cd("modern");

  s.set("METEOR_PROFILE", "0");
  s.set("NODE_INSPECTOR_IPC", "1");

  await writeModernConfig(s, {
    watcher: false,
    transpiler: false,
    minifier: false,
    webArchOnly: true, // Even when webArchOnly is true, the legacy build should be built
  });

  const buildLegacy = s.run("build", `../modern`);
  buildLegacy.waitSecs(waitToStart);

  /* Perserve legacy and modern on build */
  await buildLegacy.match(/_findSources for web\.browser/, false, true);
  await buildLegacy.match(/_findSources for web\.browser\.legacy/, false, true);

  /* Keep rest of modern build stack */
  await buildLegacy.match(/safeWatcher\.watchLegacy/, false, true);
  await buildLegacy.match(/Babel\.compile/, false, true);
  await buildLegacy.match("[DEBUG] Minifying using Terser", false, true);

  process.env.METEOR_MODERN = currentMeteorModern;
});
