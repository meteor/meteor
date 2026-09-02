import buildmessage from "../utils/buildmessage.js";
import {
  pathJoin,
  readFile,
  statOrNull,
  writeFile,
  unlink,
} from "../fs/files";

const INSTALL_JOB_MESSAGE = "installing npm dependencies";

async function runPnpmCommand(args, cwd) {
  const { getCommand, getEnv } = require("./dev-bundle-bin-helpers.js");
  const devBundleDir = require("../fs/files").getDevBundle();
  const corepackPath = getCommand("corepack", devBundleDir);
  const npxPath = getCommand("npx", devBundleDir);

  if (! corepackPath && ! npxPath) {
    return {
      success: false,
      error: "Could not find Corepack or npx in the Meteor dev bundle.",
    };
  }

  let pnpmSpec = "pnpm";
  try {
    const packageJson = JSON.parse(readFile(pathJoin(cwd, "package.json")));
    if (packageJson.packageManager?.startsWith("pnpm@")) {
      pnpmSpec = packageJson.packageManager;
    }
  } catch {
    // pnpm itself will report a missing or invalid package.json if necessary.
  }

  // Prefer Corepack when the Node distribution includes it. Some Meteor dev
  // bundles omit Corepack, so use bundled npx to run the skeleton's pinned pnpm
  // version instead of requiring a global package manager.
  const commandPath = corepackPath || npxPath;
  const commandArgs = corepackPath
    ? ["pnpm", ...args]
    : ["--yes", pnpmSpec, ...args];

  const env = await getEnv({ devBundle: devBundleDir });
  const isWindowsScript = process.platform === "win32" &&
    /\.(cmd|bat)$/i.test(commandPath);

  return new Promise(resolve => {
    require("child_process").execFile(
      commandPath,
      commandArgs,
      {
        cwd,
        env,
        maxBuffer: 10 * 1024 * 1024,
        shell: isWindowsScript,
      },
      (error, stdout, stderr) => {
        resolve({
          success: ! error,
          error: error ? `${error.message}${stderr}` : stderr,
          stdout,
          stderr,
        });
      },
    );
  });
}

export async function install(appDir, options) {
  const packageManager = options?.packageManager || "npm";
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

  const installJobMessage = packageManager === "pnpm"
    ? "installing pnpm workspace dependencies"
    : INSTALL_JOB_MESSAGE;

  const ok = await buildmessage.enterJob(installJobMessage, async function () {
    const installCommand = packageManager === "pnpm"
      ? ["install", "--frozen-lockfile=false"]
      : ["install"];
    if (options && options.includeDevDependencies) {
      if (packageManager === "npm") {
        installCommand.push("--production=false");
      }
    }

    const installResult = packageManager === "pnpm"
      ? await runPnpmCommand(installCommand, appDir)
      : await require("../isobuild/meteor-npm.js")
        .runNpmCommand(installCommand, appDir);
    if (! installResult.success) {
      buildmessage.error(
        (packageManager === "npm"
          ? "Could not install npm dependencies for test-packages: "
          : `Could not install ${packageManager} dependencies: `) +
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
