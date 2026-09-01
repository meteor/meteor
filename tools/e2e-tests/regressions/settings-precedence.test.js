import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "@jest/globals";
import fs from "fs-extra";
import path from "path";

import { assertConsoleEval } from "../assertions";
import {
  cleanupTempDir,
  createMeteorApp,
  killMeteorProcess,
  killProcessByPort,
  runMeteorApp,
} from "../helpers";

const port = 3147;
const serverSettingsPrefix = "SERVER_SETTINGS:";

const packageJsonSettings = {
  settinga: true,
  overriddenbyfile: "from-pkg",
  overriddenbyenv: "from-pkg",
  public: {
    publicfrompkg: true,
    publicoverriddenbyfile: "from-pkg",
    publicoverriddenbyenv: "from-pkg",
  },
};

const settingsFile = {
  overriddenbyfile: "from-file",
  addedbysettingsfile: true,
  public: {
    publicoverriddenbyfile: "from-file",
    publicaddedbysettingsfile: true,
  },
};

const expectedResolvedSettings = {
  settinga: true,
  overriddenbyfile: "from-file",
  overriddenbyenv: "from-env",
  addedbysettingsfile: true,
  addedbyenv: true,
  public: {
    publicfrompkg: true,
    publicoverriddenbyfile: "from-file",
    publicoverriddenbyenv: "from-env",
    publicaddedbysettingsfile: true,
    publicaddedbyenv: true,
  },
};

function extractLoggedJson(outputLines, prefix) {
  const line = outputLines.find((entry) => entry.includes(prefix));

  if (!line) {
    throw new Error(
      `Could not find log line with prefix ${prefix}.\n${outputLines.join(
        "\n"
      )}`
    );
  }

  return JSON.parse(line.slice(line.indexOf(prefix) + prefix.length).trim());
}

async function configureApp(tempDir) {
  const packageJsonPath = path.join(tempDir, "package.json");
  const packageJson = await fs.readJson(packageJsonPath);

  packageJson.meteor = {
    ...(packageJson.meteor || {}),
    settings: packageJsonSettings,
  };

  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  await fs.writeFile(
    path.join(tempDir, "extra-settings.json"),
    JSON.stringify(settingsFile, null, 2) + "\n"
  );

  await fs.writeFile(
    path.join(tempDir, "client", "main.html"),
    `<head>
  <title>settings-precedence</title>
</head>

<body>
  <h1>Settings precedence</h1>
</body>
`
  );

  await fs.writeFile(
    path.join(tempDir, "client", "main.js"),
    `import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  window.__settingsSnapshot = Meteor.settings.public;
  console.log('CLIENT_PUBLIC_SETTINGS:' + JSON.stringify(window.__settingsSnapshot));
});
`
  );

  await fs.writeFile(
    path.join(tempDir, "server", "main.js"),
    `import { Meteor } from 'meteor/meteor';

Meteor.startup(() => {
  console.log('SERVER_SETTINGS:' + JSON.stringify(Meteor.settings));
});
`
  );
}

describe("Regressions / Meteor settings precedence /", () => {
  let tempDir;
  let meteorProcess;

  beforeAll(async () => {
    ({ tempDir } = await createMeteorApp("settings-precedence", "minimal"));
    await configureApp(tempDir);
  });

  afterAll(async () => {
    await killMeteorProcess(meteorProcess);
    await killProcessByPort(port);
    await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    meteorProcess = null;
    await killProcessByPort(port);
  });

  afterEach(async () => {
    await killMeteorProcess(meteorProcess);
    await killProcessByPort(port);
  });

  test("applies package.json defaults before --settings and METEOR_SETTINGS_* overrides", async () => {
    const browserPage = global.page;
    const result = await runMeteorApp(tempDir, port, {
      waitForOutput: serverSettingsPrefix,
      commandOptions: ["--settings", "extra-settings.json"],
      env: {
        METEOR_SETTINGS_OVERRIDDENBYENV: "from-env",
        METEOR_SETTINGS_ADDEDBYENV: "true",
        METEOR_SETTINGS_PUBLIC_PUBLICOVERRIDDENBYENV: "from-env",
        METEOR_SETTINGS_PUBLIC_PUBLICADDEDBYENV: "true",
      },
    });

    meteorProcess = result.meteorProcess;

    expect(extractLoggedJson(result.outputLines, serverSettingsPrefix)).toEqual(
      expectedResolvedSettings
    );

    await browserPage.goto(`http://localhost:${port}`);
    await browserPage.waitForSelector("h1");
    await expect(browserPage.locator("h1")).toHaveText("Settings precedence");

    await assertConsoleEval(
      "window.__settingsSnapshot ?? null",
      expectedResolvedSettings.public,
      { timeout: 30000 }
    );
  });
});
