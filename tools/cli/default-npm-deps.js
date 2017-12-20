import buildmessage from "../utils/buildmessage.js";
import {
  pathJoin,
  statOrNull,
  writeFile,
  unlink,
} from "../fs/files.js";

const INSTALL_JOB_MESSAGE = "installing npm dependencies";

export function install(appDir, options) {
  const packageJsonPath = pathJoin(appDir, "package.json");
  const needTempPackageJson = ! statOrNull(packageJsonPath);

  if (needTempPackageJson) {
    const { dependencies } = require("../static-assets/skel/package.json");

    // Write a minimial package.json with the same dependencies as the
    // default new-app package.json file.
    writeFile(
      packageJsonPath,
      JSON.stringify({ dependencies }, null, 2) + "\n",
      "utf8",
    );
  }

  const ok = buildmessage.enterJob(INSTALL_JOB_MESSAGE, function () {
    const npmCommand = ["install"];
    if (options && options.includeDevDependencies) {
      npmCommand.push("--production=false");
    }

    const { runNpmCommand } = require("../isobuild/meteor-npm.js");
    const installResult = runNpmCommand(npmCommand, appDir);
    if (! installResult.success) {
      buildmessage.error(
        "Could not install npm dependencies for test-packages: " +
          installResult.error);

      return false;
    }

    return true;
  });

  if (needTempPackageJson) {
    // Clean up the temporary package.json file created above.
    unlink(packageJsonPath);
  }

  return ok;
}
