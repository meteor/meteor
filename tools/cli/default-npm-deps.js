import buildmessage from "../utils/buildmessage.js";
import {
  pathJoin,
  statOrNull,
  writeFile,
  unlink,
} from "../fs/files";

const INSTALL_JOB_MESSAGE = "installing npm dependencies";

export async function install(appDir, options) {
  const packageJsonPath = pathJoin(appDir, "package.json");
  const needTempPackageJson = ! statOrNull(packageJsonPath);

  if (needTempPackageJson) {
    // NOTE we need skel-minimal to pull in jQuery which right now is required for Blaze
    const { dependencies } = require("../static-assets/skel-blaze/package.json");

    // Write a minimal package.json with the same dependencies as the
    // default new-app package.json file.
    writeFile(
      packageJsonPath,
      JSON.stringify({ dependencies }, null, 2) + "\n",
      "utf8",
    );
  }

  const ok = await buildmessage.enterJob(INSTALL_JOB_MESSAGE, async function () {
    const npmCommand = ["install"];
    if (options && options.includeDevDependencies) {
      npmCommand.push("--production=false");
    }

    const { runNpmCommand } = require("../isobuild/meteor-npm.js");
    const installResult = await runNpmCommand(npmCommand, appDir);
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
