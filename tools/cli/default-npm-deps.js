import buildmessage from "../utils/buildmessage.js";
import {
  pathJoin,
  readFile,
  statOrNull,
  writeFile,
  unlink,
} from "../fs/files";

const INSTALL_JOB_MESSAGE = "installing npm dependencies";

export async function install(appDir, options) {
  const packageJsonPath = pathJoin(appDir, "package.json");
  const needTempPackageJson = ! statOrNull(packageJsonPath);
  const originalPackageJson = needTempPackageJson
    ? null
    : readFile(packageJsonPath, "utf8");
  const additionalDevDependencies = options?.additionalDevDependencies || {};
  const needTemporaryMutation = needTempPackageJson ||
    Object.keys(additionalDevDependencies).length > 0;

  if (needTemporaryMutation) {
    // NOTE we need skel-minimal to pull in jQuery which right now is required for Blaze
    const { dependencies } = require("../static-assets/skel-blaze/package.json");
    const packageJson = originalPackageJson
      ? JSON.parse(originalPackageJson)
      : { dependencies };
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      ...additionalDevDependencies,
    };

    writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2) + "\n",
      "utf8",
    );
  }

  let ok;
  try {
    ok = await buildmessage.enterJob(INSTALL_JOB_MESSAGE, async function () {
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
  } finally {
    if (needTemporaryMutation) {
      if (originalPackageJson == null) {
        unlink(packageJsonPath);
      } else {
        writeFile(packageJsonPath, originalPackageJson, "utf8");
      }
    }
  }

  return ok;
}
