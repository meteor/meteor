// this script is used in the following way:
// node index.js <package>.<major|minor|patch> # if does not include a version, it will default to patch for betas and rc's use <package>.<major|minor|patch|beta|rc>
// for example:
// node scripts/admin/update-semver/index.js meteor-tool.patch ddp base64.beta
// or
// node scripts/admin/update-semver/index.js @auto # it will update by a patch all packages that have changed since the last release compared to master

const semver = require('semver');
const fs = require('fs');
const { exec } = require("child_process");

const runCommand = async (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`error: ${ error.message }`);
        reject(error);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${ stderr }`);
        reject(stderr);
        return;
      }
      resolve(stdout);
    });
  })
}

async function getPackages() {
  return await runCommand("./get-diff.sh");
}

async function main() {
  let args = process.argv.slice(2);

  if (args[0] === '@auto') {
    const packages = await getPackages();
    args = packages
      .split('/')
      .filter((packageName) => packageName !== 'packages' && packageName !== "\npackages" && packageName !== "\n");
  }
  /**
   * @type {{
   *   name: string,
   *   version: string,
   * }[]}
   */
  const packages = args.map(arg => {
    const [name, release] = arg.split('.');
    return { name, release: release || 'patch' };
  });
  for (const { name, release } of packages) {
    const filePath = `../../../packages/${ name }/package.js`;
    const code = await fs.promises.readFile(filePath, 'utf8');

    for (const line of code.split(/\n/)) {
      // should only run on lines that have a version
      if (!line.includes('version')) continue;

      const [_, lineVersion] = line.split(':');

      const currentVersion = lineVersion.trim().replace(',', '');
      const semverVersion = semver.coerce(currentVersion);

      /**
       *
       * @param release{string}
       * @returns {string}
       */
      function incrementNewVersion(release) {
        if (release.includes('beta') || release.includes('rc')) {
          return semver.inc(semverVersion, 'prerelease', release);
        }
        return semver.inc(semverVersion, release);
      }

      const newVersion = incrementNewVersion(release);
      console.log(`Updating ${ name } from ${ currentVersion } to ${ newVersion }`);
      const newCode = code.replace(currentVersion, "'" + newVersion + "'");
      await fs.promises.writeFile(filePath, newCode);
    }
  }
}

main();
