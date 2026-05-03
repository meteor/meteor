var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

// No need for a high value since the asserts already wait long enough to pass tests
const waitToStart = 5;

// Applies env var overrides for the duration of `fn`, then restores them on
// every exit path. Required for retry-compatibility: without the try/finally,
// a mid-body failure would leak the mutated env into the subsequent retry and
// into the Sandbox it spawns, producing a different starting state than the
// first attempt.
async function withEnv(overrides, fn) {
  const saved = Object.fromEntries(
    Object.keys(overrides).map(k => [k, process.env[k]])
  );
  Object.assign(process.env, overrides);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

async function writeModernConfig(s, modernConfig) {
  const json = JSON.parse(s.read("package.json"));

  json.meteor = {
    ...json.meteor,
    modern: modernConfig,
  };

  s.write("package.json", JSON.stringify(json, null, 2) + "\n");
}

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

selftest.define("modern build stack - transpiler boolean-like options", async function () {
  await withEnv({ METEOR_MODERN: '', METEOR_DISABLE_COLORS: 'true' }, async () => {
    const s = new Sandbox();
    await s.init();

    s.mkdir("config-package");
    s.cd("config-package");

    s.write(
      "package.json",
      JSON.stringify({
        name: "config",
        version: "1.2.3",
        "private": true,
        main: "index.js"
      }, null, 2) + "\n"
    );

    s.write(
      "index.js",
      "exports.id = module.id;\n"
    );

    s.cd(s.home);

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.append(
      "server/main.js",
      `if (require('config')) {
  console.log('Loaded NPM package "config"', require('config').id);
}`);

    await writeModernConfig(s, {
      transpiler: {
        verbose: true,
      },
    });

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    /* check appended NPM package require */
    await run.match(/Loaded NPM package "config"/, false, true);

    /* check verbose logs */
    await run.match(/SWC Custom Config/, false, true);
    await run.match(/Meteor Config/, false, true);

    /* check transpiler options */
    await run.match(/\[Transpiler] Used SWC.*\(app\)/, false, true);
    await run.match(/\[Transpiler] Used SWC.*\(package\)/, false, true);
    run.forbid(/\[Transpiler] Used SWC.*\(node_modules\)/, false, true);

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

    await writeConfig(s, {
      modern: {
        transpiler: {
          verbose: true,
        },
      },
      nodeModules: {
        recompile: {
          config: true,
        },
      },
    });
    await run.match(/\[Transpiler] Used SWC.*\(node_modules\)/, false, true);

    await run.stop();
  });
});

selftest.define("modern build stack - transpiler string-like options", async function () {
  await withEnv({ METEOR_MODERN: '', METEOR_DISABLE_COLORS: 'true' }, async () => {
    const s = new Sandbox();
    await s.init();

    s.mkdir("config-package");
    s.cd("config-package");

    s.write(
      "package.json",
      JSON.stringify({
        name: "config",
        version: "1.2.3",
        "private": true,
        main: "index.js"
      }, null, 2) + "\n"
    );

    s.write(
      "index.js",
      "exports.id = module.id;\n"
    );

    s.cd(s.home);

    await s.createApp("modern", "modern");
    await s.cd("modern");

    s.append(
      "server/main.js",
      `import { id } from 'config';
console.log('Loaded NPM package "config"', require('config').id);`);

    await writeModernConfig(s, {
      transpiler: {
        verbose: true,
      },
    });

    const run = s.run();

    run.waitSecs(waitToStart);
    await run.match("App running at");

    /* check appended NPM package imported */
    await run.match(/Loaded NPM package "config"/, false, true);

    /* check verbose logs */
    await run.match(/SWC Custom Config/, false, true);
    await run.match(/Meteor Config/, false, true);

    /* check transpiler options */
    await run.match(/\[Transpiler] Used SWC.*\(app\)/, false, true);
    await run.match(/\[Transpiler] Used SWC.*\(package\)/, false, true);
    run.forbid(/\[Transpiler] Used SWC.*\(node_modules\)/, false, true);

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

    await writeConfig(s, {
      modern: {
        transpiler: {
          verbose: true,
        },
      },
      nodeModules: {
        recompile: {
          config: true,
        },
      },
    });
    await run.match(/\[Transpiler] Used SWC.*\(node_modules\)/, false, true);

    await run.stop();
  });
});

selftest.define("modern build stack - transpiler custom .swcrc", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
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
  });
});

selftest.define("modern build stack - transpiler custom swc.config.js", async function () {
  await withEnv({ METEOR_MODERN: '' }, async () => {
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
  });
});

selftest.define("modern build stack - transpiler files", async function () {
  await withEnv({ METEOR_MODERN: 'true' }, async () => {
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
});
