// this script is used in the following way:
// node index.js <package>.<major|minor|patch|beta|rc> # if does not include a version, it will default to patch.
// node scripts/admin/update-semver/index.js meteor-tool.patch ddp base64.beta
// or
// node scripts/admin/update-semver/index.js @auto # it will update by a patch all packages that have changed since the last release compared to master

const semver = require('semver');
const fs = require('fs');
const { exec } = require("child_process");
const { readdir } = require("fs/promises");

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

/**
 *
 * @returns {Promise<string>}
 */
async function getPackages() {
  return await runCommand("./get-diff.sh");
}

async function getFile(path) {
  try {
    const data = await fs.promises.readFile(path, 'utf8');
    return [data, null]
  } catch (e) {
    console.error(e);
    return ['', e];
  }

}

const getDirectories = async source =>
  (await readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

async function main() {
  /**
   * @type {string[]}
   */
  let args = process.argv.slice(2);

  if (args[0].startsWith('@all')) {
    const [_, type] = args[0].split('.');
    const allPackages = await getDirectories('../../../packages');
    args = allPackages.map((packageName) => `${ packageName }.${ type }`);
  }

  if (args[0].startsWith('@auto')) {
    const [_, type] = args[0].split('.');
    // List of packages that for some reason are not in the diff.
    // If there is a change in one of them please do not forget
    // to add it to the list.
    // List:
    // ddp-common

    const p = await getPackages();
    console.log('****************')
    console.log('Will be updating the following packages:');
    console.dir(p)
    console.log('****************')
    const packages = p.concat(`packages/meteor-tool.${ type }`);
    args = packages
      .split('/')
      .filter((packageName) => packageName !== 'packages' && packageName !== "\npackages" && packageName !== "\n")
      .map((packageName) => `${ packageName }.${ type }`);
  }

  /**
   * @type {{release, name: string|null}[]}
   */
  const packages = args.map(arg => {
    const [name, release] = arg.split('.');
    return { name, release: release || 'patch' };
  });
  for (const { name, release } of packages) {
    const filePath = `../../../packages/${ name }/package.js`;
    const [code, err] = await getFile(filePath);
    // if there is an error reading the file, we will skip it.
    if (err) continue;
    for (const line of code.split(/\n/)) {
      // should only run on lines that have a version
      if (!line.includes('version')) continue;

      //Package.describe({
      //   summary: 'some description.',
      //   version: '1.2.3' <--- this is the line we want, we assure that it has a version in the previous if
      //});
      const [_, versionValue] = line.split(':');
      if (!versionValue) continue;
      const currentVersion = versionValue
        .trim()
        .replace(',', '')
        .replace(/'/g, '')
        .replace(/"/g, '');


      /**
       *
       * @param release{string}
       * @returns {string}
       */
      function incrementNewVersion(release) {
        if (release.includes('beta') || release.includes('rc')) {
          return semver.inc(currentVersion, 'prerelease', release);
        }
        return semver.inc(currentVersion, release);
      }

      const newVersion = incrementNewVersion(release);
      console.log(`Updating ${ name } from ${ currentVersion } to ${ newVersion }`);
      const newCode = code.replace(currentVersion, `${ newVersion }`);
      await fs.promises.writeFile(filePath, newCode);
    }
  }
  console.log('Done!');
  if (!args[0].startsWith('@auto')) console.log('Do not forget to update meteor-tool');
}

main();
