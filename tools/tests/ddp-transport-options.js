const selftest = require("../tool-testing/selftest.js");
const files = require("../fs/files");
const buildmessage = require("../utils/buildmessage.js");
const { getMeteorRuntimeConfigFromHTML } = require("../tool-testing/test-utils.js");

selftest.define("cordova - DDP transport bootstrap", async function () {
  const { ensureDevBundleDependencies } = require("../cordova/index.js");
  const dependencyMessages = await buildmessage.capture(async () => {
    await ensureDevBundleDependencies();
  });
  selftest.expectFalse(dependencyMessages.hasMessages());
  const { CordovaProject } = require("../cordova/project.js");
  const { CordovaBuilder } = require("../cordova/builder.js");
  const s = new selftest.Sandbox();
  await s.init();
  s.mkdir("app");
  files.mkdir_p(files.pathJoin(s.cwd, "bundle/programs/web.cordova"));
  s.write("bundle/programs/web.cordova/program.json", JSON.stringify({ manifest: [] }));
  const projectContext = {
    projectDir: files.pathJoin(s.cwd, "app"),
    appIdentifier: "testapp",
    getProjectLocalDirectory: (name) => files.pathJoin(s.cwd, name),
  };

  // Exercise the real project -> builder -> bootstrap HTML path. Only native
  // platform/plugin setup and resource copying are outside this regression.
  const originalWriteResources = CordovaBuilder.prototype.writeConfigXmlAndCopyResources;
  CordovaBuilder.prototype.writeConfigXmlAndCopyResources = async () => {};
  try {
    for (const [ddpTransport, expected] of [
      ["uws", "uws"],
      ["sockjs", "sockjs"],
      ["both", undefined],
      [undefined, undefined],
    ]) {
      const project = new CordovaProject(projectContext, {
        mobileServerUrl: "https://example.com",
        ddpTransport,
      });
      project.ensurePluginsAreSynchronized = async () => {};
      project.ensurePlatformsAreSynchronized = async () => {};
      const messages = await buildmessage.capture(async () => {
        await buildmessage.enterJob({ title: "preparing test bootstrap" }, async () => {
          await project.prepareFromAppBundle(files.pathJoin(s.cwd, "bundle"), {});
        });
      });
      selftest.expectFalse(messages.hasMessages());
      const html = s.read("cordova-build/www/application/index.html");
      const config = getMeteorRuntimeConfigFromHTML(html);
      await selftest.expectEqual(config.DDP_TRANSPORT, expected);
      await selftest.expectEqual(config.DDP_DEFAULT_CONNECTION_URL, "https://example.com");
      if (expected === undefined) {
        selftest.expectFalse(Object.hasOwn(config, "DDP_TRANSPORT"));
      }
    }
  } finally {
    CordovaBuilder.prototype.writeConfigXmlAndCopyResources = originalWriteResources;
  }
});

selftest.define("deploy - DDP transport options", async function () {
  const { deployCommand } = require("../cli/commands.js");
  const auth = require("../meteor-services/auth.js");
  const deploy = require("../meteor-services/deploy.js");
  const projectContextModule = require("../project-context.js");
  const { Console } = require("../console/console.js");
  const original = {
    isLoggedIn: auth.isLoggedIn,
    maybePrintRegistrationLink: auth.maybePrintRegistrationLink,
    bundleAndDeploy: deploy.bundleAndDeploy,
    ProjectContext: projectContextModule.ProjectContext,
    error: Console.error,
  };
  const received = [];
  const errors = [];
  let authChecks = 0;
  let projectPreparations = 0;
  try {
    auth.isLoggedIn = () => {
      authChecks++;
      return true;
    };
    auth.maybePrintRegistrationLink = async () => {};
    projectContextModule.ProjectContext = class {
      constructor() {
        this.packageMapDelta = { displayOnConsole() {} };
      }
      async prepareProjectForBuild() {
        projectPreparations++;
      }
    };
    deploy.bundleAndDeploy = async (options) => {
      received.push(options.buildOptions.ddpTransport);
      return 0;
    };
    Console.error = (message) => {
      errors.push(message);
    };

    for (const value of ["uws", undefined]) {
      const options = { args: ["example.com"], appDir: "/unused" };
      if (value !== undefined) options["ddp-transport"] = value;
      await selftest.expectEqual(await deployCommand(options, { rawOptions: {} }), 0);
    }
    await selftest.expectEqual(received, ["uws", "both"]);
    await selftest.expectEqual(authChecks, 2);
    await selftest.expectEqual(projectPreparations, 2);

    await selftest.expectEqual(
      await deployCommand(
        {
          args: ["example.com"],
          "ddp-transport": "websocket",
        },
        { rawOptions: {} },
      ),
      1,
    );
    selftest.expectTrue(
      errors.some(
        (message) =>
          message === 'Invalid DDP transport "websocket". Valid values: sockjs, uws, both.',
      ),
    );
    // Console.error receives the command's no-wrap markers before rendering.
    selftest.expectTrue(
      errors.some((message) => message.includes(Console.command("meteor help deploy"))),
    );
    await selftest.expectEqual(authChecks, 2);
    await selftest.expectEqual(projectPreparations, 2);
    await selftest.expectEqual(received, ["uws", "both"]);
  } finally {
    auth.isLoggedIn = original.isLoggedIn;
    auth.maybePrintRegistrationLink = original.maybePrintRegistrationLink;
    deploy.bundleAndDeploy = original.bundleAndDeploy;
    projectContextModule.ProjectContext = original.ProjectContext;
    Console.error = original.error;
  }
});
