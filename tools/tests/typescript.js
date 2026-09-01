var selftest = require('../tool-testing/selftest.js');
var files = require('../fs/files');
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
  await run.match("Skipped type generation because zodern:types is installed.");
  await run.expectExit(0);

  // zodern:types is implemented as a linter, so linting materializes its
  // .meteor/local/types output before the standalone TypeScript check.
  run = s.run("lint");
  run.waitSecs(120);
  await run.expectExit(0);

  const zodernBarrel = s.read(".meteor/local/types/packages.d.ts");
  selftest.expectTrue(zodernBarrel !== null);
  selftest.expectTrue(zodernBarrel.includes("random.d"));
  selftest.expectTrue(!zodernBarrel.includes("random.native"));

  run = s.run("node", "node_modules/typescript/bin/tsc");
  run.waitSecs(60);
  await run.expectEnd();
  await run.expectExit(0);

  // Removing zodern does not change the template's external-first precedence.
  // The project explicitly selects native declarations in a derived config.
  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/local/types/packages.d.ts") === null);
  selftest.expectTrue(
    s.read(".meteor/types/packages/random/declarations/index.d.ts")
      .includes("createWithSeeds")
  );

  s.write("tsconfig.native.json", JSON.stringify({
    extends: "./tsconfig.json",
    files: ["./.meteor/types/packages.d.ts"],
    include: ["**/*.ts", "**/*.tsx"],
    compilerOptions: {
      paths: {
        "/*": ["./*"],
        "meteor/*": ["./.meteor/types/packages/*"],
      },
    },
  }));

  s.write("native-types-resolution.ts", `
    import { Random } from "meteor/random";
    import { Template } from "meteor/templating";
    import { useTracker } from "meteor/react-meteor-data/suspense";

    Random.id();
    Random.createWithSeeds("native-only").id();
    Template.body.helpers({ value: () => 1 });
    useTracker("native-types-resolution", async () => 42);
  `);

  run = s.run(
    "node",
    "node_modules/typescript/bin/tsc",
    "--project",
    "tsconfig.native.json"
  );
  run.waitSecs(60);
  await run.expectEnd();
  await run.expectExit(0);
});

selftest.define("javascript template stays out of native type generation", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "javascript");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'javascript'.");
  await run.expectExit(0);

  s.cd("javascript");
  selftest.expectTrue(s.read("tsconfig.json") === null);
  selftest.expectTrue(s.read("jsconfig.json") === null);

  run = s.run("types");
  await run.match("No tsconfig.json or jsconfig.json found. Nothing to do.");
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === null);

  s.write("jsconfig.json", JSON.stringify({ compilerOptions: { checkJs: true } }));
  run = s.run("build", "--directory", "../javascript-build");
  run.waitSecs(180);
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === null);
});

selftest.define("ordinary builds do not generate native declarations", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "types-opt-in");
  run.waitSecs(60);
  await run.match("Created a new Meteor app");
  await run.expectExit(0);

  s.cd("types-opt-in");
  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("build", "--directory", "../types-opt-in-build");
  run.waitSecs(180);
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === null);
});

selftest.define("core package declarations are not client assets", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "typed-assets");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'typed-assets'.");
  await run.expectExit(0);

  s.cd("typed-assets");
  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

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

  const serverProgram = s.read(
    "../typed-assets-build/bundle/programs/server/program.json"
  );
  selftest.expectTrue(serverProgram !== null);
  selftest.expectTrue(!serverProgram.includes("reload.d.ts"));
  selftest.expectTrue(!serverProgram.includes("facts-ui.d.ts"));
  selftest.expectTrue(!serverProgram.includes("jquery.d.ts"));
});

selftest.define("zodern:types leaves native declarations untouched", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--minimal", "zodern-transition");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'zodern-transition'.");
  await run.expectExit(0);

  s.cd("zodern-transition");
  s.write("tsconfig.json", JSON.stringify({ compilerOptions: { noEmit: true } }));

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  const nativeBarrel = s.read(".meteor/types/packages.d.ts");
  selftest.expectTrue(nativeBarrel !== null);

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

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === nativeBarrel);

  run = s.run("build", "--directory", "../zodern-transition-build");
  run.waitSecs(180);
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === nativeBarrel);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Skipped type generation because zodern:types is installed.");
  await run.expectExit(0);

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") === nativeBarrel);

  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);

  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") !== null);
});

selftest.define("transitive zodern:types keeps native declarations", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "zodern-transitive");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'zodern-transitive'.");
  await run.expectExit(0);

  s.cd("zodern-transitive");
  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  s.mkdir("packages");
  s.mkdir("packages/zodern-types");
  s.write("packages/zodern-types/package.js", `
    Package.describe({
      name: "zodern:types",
      version: "1.0.13",
      summary: "Transitive zodern:types compatibility fixture",
      documentation: null
    });
  `);
  s.mkdir("packages/transitive-types");
  s.write("packages/transitive-types/package.js", `
    Package.describe({
      name: "fixture:transitive-types",
      version: "1.0.0",
      summary: "Parent package for a transitive zodern:types dependency",
      documentation: null
    });
    Package.onUse(function (api) {
      api.use("zodern:types");
    });
  `);

  run = s.run("add", "fixture:transitive-types");
  run.waitSecs(60);
  await run.expectExit(0);

  const directConstraints = s.read(".meteor/packages")
    .split("\n")
    .map(line => line.trim());
  selftest.expectTrue(
    ! directConstraints.some(line => /^zodern:types(?:@|$)/.test(line))
  );

  run = s.run("types");
  run.waitSecs(60);
  await run.match("Generated package type declarations.");
  await run.expectExit(0);
  selftest.expectTrue(s.read(".meteor/types/packages.d.ts") !== null);
});

selftest.define("type generation failure follows command strictness", async function () {
  const s = new Sandbox();
  await s.init();

  let run = s.run("create", "--typescript", "types-failure");
  run.waitSecs(60);
  await run.match("Created a new Meteor app in 'types-failure'.");
  await run.expectExit(0);

  s.cd("types-failure");
  run = s.run("remove", "zodern:types");
  run.waitSecs(60);
  await run.expectExit(0);

  await files.rm_recursive(files.pathJoin(s.cwd, ".meteor", "types"));
  s.write(".meteor/types", "filesystem obstruction\n");

  run = s.run("build", "--directory", "../types-failure-build");
  run.waitSecs(180);
  await run.expectExit(0);
  run.forbidAll("Failed to generate package type declarations");

  run = s.run("types");
  run.waitSecs(120);
  await run.matchErr(/Failed to generate package type declarations/);
  await run.match(/Failed to generate package type declarations\./);
  await run.expectExit(1);
});
