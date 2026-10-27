// this script is used in the following way:
// node index.js <package>.<major|minor|patch|beta|rc> # if does not include a version, it will default to patch.
// node scripts/admin/update-semver/index.js meteor-tool.patch ddp base64.beta
// or
// node scripts/admin/update-semver/index.js @auto # it will update by a patch all packages that have changed since the last release compared to master

const semver = require('semver');
const fs = require('fs');
const { exec } = require("child_process");
const { readdir } = require("fs/promises");
const { loadPackages, cascade } = require('./build-plugin-cascade');

/**
 *
 * @param command
 * @return {Promise<string>}
 */
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

async function getReleaseNumber() {
  // only works if you are in the release branch. it will return someting
  // like release-2.4 or release-2.4.2
  const gitBranch = await runCommand("./get-branch-name.sh");
  if (!gitBranch.includes('release')) throw new Error('You are not in a release branch');

  const releaseNumber = gitBranch
    .replace('release-', '')
    .replace('.', '')
    .replace('\n', '');

  // this is when we have release-2.4 and we want to make sure that we have release-2.4.0
  if (gitBranch.match(/\./g).length === 1) return `${ releaseNumber }0`;

  return releaseNumber;
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
  // if gets bigger turn into a function
  const dir = args[1]?.includes("blaze")
    ? "packages/non-core/blaze/packages"
    : "packages";
  const releaseNumber = await getReleaseNumber();
  if (args[0].startsWith('@all')) {
    const [_, type] = args[0].split('.');
    
 

    const allPackages = await getDirectories(`../../../${ dir }`);
    args = allPackages.map((packageName) => `${ packageName }.${ type }`);
  }

  if (args[0].startsWith('@auto')) {
    const [_, type] = args[0].split('.');
    const p = await getPackages();
    const changed = [...new Set(p.split('\n').map((line) => line.split('/')[1]).filter(Boolean))];
    console.log('****************')
    console.log('Will be updating the following packages:');
    console.dir(changed)
    console.log('****************')
    args = changed.concat('meteor-tool').map((packageName) => `${ packageName }.${ type }`);
  }

  /**
   * @type {{release, name: string|null}[]}
   */
  const packages = args.map(arg => {
    const [name, release] = arg.split('.');
    return { name, release: release || 'patch' };
  })
    // we remove duplicates by name
    .filter((value, index, self) => self.findIndex((v) => v.name === value.name) === index);

  // Build plugin packages ship their dependencies compiled in, so they must be
  // republished whenever an embedded package is bumped.
  const RELEASE_RANK = ['beta', 'rc', 'patch', 'minor', 'major'];
  const cascaded = cascade(loadPackages(`../../../${ dir }`), packages.map(({ name }) => name));
  for (const [name, embeds] of Object.entries(cascaded)) {
    const release = packages
      .filter((p) => embeds.includes(p.name))
      .map((p) => p.release)
      .sort((a, b) => RELEASE_RANK.indexOf(b) - RELEASE_RANK.indexOf(a))[0];
    console.log(`Cascade: ${ name }.${ release } (its build plugin embeds ${ embeds.join(', ') })`);
    packages.push({ name, release });
  }

  for (const { name, release } of packages) {
    const filePath = `../../../${ dir }/${ name }/package.js`;
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
      const [_, version] = line.split(':');
      if (!version) continue;

      // for updating all packages
      if (version.includes("-alpha300")) continue;
       
      const getVersionValue = (value) => {
        const removeQuotes =
          (v) => v
            .trim()
            .replace(',', '')
            .replace(/'/g, '')
            .replace(/"/g, '');

        if (value.includes('-')) {
          return {
            currentVersion: removeQuotes(value.replace(releaseNumber, '')),
            rawVersion: value
          }
        }
        return {
          currentVersion: removeQuotes(value),
          rawVersion: value
        }
      }
      const { currentVersion, rawVersion } = getVersionValue(version)


      /**
       *
       * @param release{string}
       * @returns {string}
       */
      function incrementNewVersion(release) {
        if (release === 'beta' || release === 'rc') {
          const version =
            semver.inc(currentVersion, 'prerelease', release);
          if (name === 'meteor-tool') return version;
          return version?.replace(release, `${ release }${ releaseNumber }`);
        }
        return semver.inc(currentVersion, release);
      }

      const n = incrementNewVersion(release);
      const newVersion = n?.replace(n, `${n}`)
      console.log(`Updating ${ name } from ${ currentVersion } to ${ newVersion }`);
      const newCode = code.replace(rawVersion, ` '${ newVersion }',`);
      await fs.promises.writeFile(filePath, newCode);
    }
  }
  console.log('Done!');
  if (!args.some(arg => arg.includes('meteor-tool'))) console.log('Do not forget to update meteor-tool');
}

main();
