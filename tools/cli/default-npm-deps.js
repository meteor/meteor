import buildmessage from "../utils/buildmessage.js";
import {
  pathJoin,
  statOrNull,
  writeFile,
} from "../fs/files.js";

const INSTALL_JOB_MESSAGE = "installing dependencies from package.json";

export function install(appDir) {
  const testAppPkgJsonPath = pathJoin(appDir, "package.json");

  if (! statOrNull(testAppPkgJsonPath)) {
    const { dependencies } = require("../static-assets/skel/package.json");

    // Write a minimial package.json with the same dependencies as the
    // default new-app package.json file.
    writeFile(
      testAppPkgJsonPath,
      JSON.stringify({ dependencies }, null, 2) + "\n",
      "utf8",
    );
  }

  return buildmessage.enterJob(INSTALL_JOB_MESSAGE, function () {
    const { runNpmCommand } = require("../isobuild/meteor-npm.js");

    const installResult = runNpmCommand(["install"], appDir);
    if (! installResult.success) {
      buildmessage.error(
        "Could not install npm dependencies for test-packages: " +
          installResult.error);

      return false;
    }

    return true;
  });
}
