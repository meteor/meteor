var selftest = require('../tool-testing/selftest.js');
var Sandbox = selftest.Sandbox;

selftest.define("typescript template works", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "typescript");

  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'typescript'.");
  await run.match("To run your new app");

  s.cd("typescript");

  const appPackage = JSON.parse(s.read("package.json"));
  selftest.expectTrue(!!appPackage.devDependencies.typescript);

  run = s.run("npm", "install", "--include=dev");
  await run.expectExit(0);

  const installedTypeScript = s.read("node_modules/typescript/package.json");
  selftest.expectTrue(installedTypeScript !== null);
  selftest.expectTrue(
    JSON.parse(installedTypeScript).name === "typescript"
  );

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  run = s.run("node", "node_modules/typescript/bin/tsc");
  run.waitSecs(60);
  await run.expectEnd();
  await run.expectExit(0);
});

selftest.define("core package declarations are not client assets", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "typed-assets");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'typed-assets'.");
  await run.expectExit(0);

  s.cd("typed-assets");
  run = s.run("add", "facts-ui", "jquery");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  selftest.expectTrue(
    s.read(".meteor/types/packages/reload/index.d.ts") !== null
  );
  selftest.expectTrue(
    s.read(".meteor/types/packages/facts-ui/index.d.ts") !== null
  );
  selftest.expectTrue(
    s.read(".meteor/types/packages/jquery/index.d.ts") !== null
  );

  run = s.run("build", "--directory", "../typed-assets-build");
  run.waitSecs(180);
  await run.expectExit(0);

  const browserProgram = s.read(
    "../typed-assets-build/bundle/programs/web.browser/program.json"
  );
  selftest.expectTrue(browserProgram !== null);
  selftest.expectTrue(!browserProgram.includes("reload.d.ts"));
  selftest.expectTrue(!browserProgram.includes("facts-ui.d.ts"));
  selftest.expectTrue(!browserProgram.includes("jquery.d.ts"));
});

selftest.define("zodern:types removes stale native declarations", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "zodern-transition");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'zodern-transition'.");
  await run.expectExit(0);

  s.cd("zodern-transition");
  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") !== null);

  s.mkdir("packages");
  s.mkdir("packages/zodern-types");
  s.write("packages/zodern-types/package.js", `
    Package.describe({
      name: "zodern:types",
      version: "1.0.13",
      summary: "Local zodern:types compatibility fixture",
      documentation: null
    });
  `);

  run = s.run("add", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Skipped type generation because zodern:types is installed.");
  await run.expectExit(0);

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === null);

  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") !== null);
});
