const { DownloaderHelper } = require('node-downloader-helper');
const cliProgress = require('cli-progress');
const Seven = require('node-7z');
const path = require('path');
const sevenBin = require('7zip-bin');
const semver = require('semver');
const child_process = require('child_process');
const tmp = require('tmp');
const os = require('os');
const fs = require('fs');

const fsPromises = fs.promises;

const {
  meteorPath,
  release,
  startedPath,
  extractPath,
  isWindows,
  rootPath,
  sudoUser,
  isSudo,
  isMac,
  METEOR_LATEST_VERSION,
  shouldSetupExecPath,
} = require('./config');
const { uninstall } = require('./uninstall');
const {
  extractWithTar,
  extractWith7Zip,
  extractWithNativeTar,
} = require('./extract');
const { engines } = require('./package.json');

const nodeVersion = engines.node;
const npmVersion = engines.npm;

// Compare installed NodeJs version with required NodeJs version
if (!semver.satisfies(process.version, nodeVersion)) {
  console.warn(
    `WARNING: Recommended versions are Node.js ${nodeVersion} and npm ${npmVersion}.`
  );
  console.warn(
    `We recommend using a Node version manager like NVM or Volta to install Node.js and npm.\n`
  );
}

const isInstalledGlobally = process.env.npm_config_global === 'true';

if (!isInstalledGlobally) {
  console.error('******************************************');
  console.error(
    'You are not using a global npm context to install, you should never add meteor to your package.json.'
  );
  console.error('Make sure you pass -g to npm install.');
  console.error('Aborting...');
  console.error('******************************************');
  process.exit(1);
}
process.on('unhandledRejection', err => {
  throw err;
});
if (os.arch() !== 'x64') {
  const isValidM1Version = semver.gte(
    semver.coerce(METEOR_LATEST_VERSION),
    '2.5.1-beta.3'
  );
  if (os.arch() !== 'arm64' || !isMac() || !isValidM1Version) {
    console.error(
      'The current architecture is not supported in this version: ',
      os.arch(),
      '. Try Meteor 2.5.1-beta.3 or above.'
    );
    process.exit(1);
  }
}

const downloadPlatform = {
  win32: 'windows',
  darwin: 'osx',
  linux: 'linux',
};

const url = `https://packages.meteor.com/bootstrap-link?arch=os.${
  downloadPlatform[os.platform()]
}.${os.arch() === 'arm64' ? 'arm64' : 'x86_64'}&release=${release}`;

let tempDirObject;
try {
  tempDirObject = tmp.dirSync();
} catch (e) {
  console.error('');
  console.error('');
  console.error('****************************');
  console.error("Couldn't create tmp dir for extracting meteor.");
  console.error('There are 2 possible causes:');
  console.error(
    '\t1. You are running npm install -g meteor as root without passing the --unsafe-perm option. Please rerun with this option enabled.'
  );
  console.error(
    '\t2. You might not have enough space in disk or permission to create folders'
  );
  console.error('****************************');
  console.error('');
  console.error('');
  process.exit(1);
}
const tempPath = tempDirObject.name;
const tarGzName = 'meteor.tar.gz';
const tarName = 'meteor.tar';

// This file only exists while files are being extracted, and is removed after
// the extraction succeeds. If it still exists, there is either another instance of
// the installer running, or it failed the last time it extracted files.
if (fs.existsSync(startedPath)) {
  console.log('It seems the previous installation of Meteor did not succeed.');
  uninstall();
  console.log('');
} else if (fs.existsSync(meteorPath)) {
  console.log('Meteor is already installed at', meteorPath);
  console.log(
    `If you want to reinstall it, run:

  $ meteor-installer uninstall
  $ meteor-installer install
`
  );
  process.exit();
}

// Creating symlinks requires running as an administrator or
// for developer mode to be enabled
let canCreateSymlinks = false;
try {
  const target = path.resolve(tempPath, 'test-target.txt');
  const symlinkPath = path.resolve(tempPath, 'symlink.txt');

  fs.writeFileSync(target, '');
  fs.symlinkSync(target, symlinkPath, 'file');

  fs.unlinkSync(symlinkPath);
  fs.unlinkSync(target);
  canCreateSymlinks = true;
} catch (e) {
  if (e.code === 'EPERM') {
    // Leave canCreateSymlinks as false
  } else {
    console.error('Unable to check if able to create symlinks');
    console.error(e);
    console.log('Assuming unable to create symlinks');
  }
}

download();

function generateProxyAgent() {
  const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY;
  if (!proxyUrl) {
    return undefined;
  }

  const HttpsProxyAgent = require('https-proxy-agent');

  return new HttpsProxyAgent(proxyUrl);
}

function download() {
  const start = Date.now();
  const downloadProgress = new cliProgress.SingleBar(
    {
      format: 'Downloading |{bar}| {percentage}%',
      clearOnComplete: true,
    },
    cliProgress.Presets.shades_classic
  );
  downloadProgress.start(100, 0);

  const dl = new DownloaderHelper(url, tempPath, {
    retry: { maxRetries: 5, delay: 5000 },
    override: true,
    fileName: tarGzName,
    httpsRequestOptions: {
      agent: generateProxyAgent(),
    },
  });

  dl.on('progress', ({ progress }) => {
    downloadProgress.update(progress);
  });
  dl.on('end', async () => {
    downloadProgress.update(100);
    downloadProgress.stop();
    const end = Date.now();
    console.log(`=> Meteor Downloaded in ${(end - start) / 1000}s`);

    const exists = fs.existsSync(path.resolve(tempPath, tarGzName));
    if (!exists) {
      throw new Error('meteor.tar.gz does not exist');
    }

    if (isWindows()) {
      const hasNativeTar = fs.existsSync(path.resolve('C:/Windows/System32', 'tar.exe'));
      if (hasNativeTar) {
        // tar works exactly the same as it's bsdtar counterpart on UNIX so continue
        console.log(`Native binary for tar is available on this version of Windows.`);
        console.log(`Switching to the native tar.exe binary on Windows.`);
      } else {
        decompress();
        return;
      }
    }

    fs.writeFileSync(startedPath, 'Meteor install started');
    console.log('=> Extracting the tarball, this may take some time');
    const extractStart = Date.now();
    await extractWithNativeTar(path.resolve(tempPath, tarGzName), extractPath);
    const extractEnd = Date.now();
    console.log(
      `=> Meteor extracted in ${(extractEnd - extractStart) / 1000}s`
    );
    await setup();
  });

  dl.start();
}

function decompress() {
  const start = Date.now();
  const decompressProgress = new cliProgress.SingleBar(
    {
      format: 'Decompressing |{bar}| {percentage}%',
      clearOnComplete: true,
    },
    cliProgress.Presets.shades_classic
  );
  decompressProgress.start(100, 0);

  const myStream = Seven.extract(path.resolve(tempPath, tarGzName), tempPath, {
    $progress: true,
    $bin: sevenBin.path7za,
  });
  myStream.on('progress', function(progress) {
    decompressProgress.update(progress.percent);
  });

  myStream.on('end', function() {
    decompressProgress.update(100);
    decompressProgress.stop();
    const end = Date.now();
    console.log(`=> Meteor Decompressed in ${(end - start) / 1000}s`);
    extract();
  });
}

async function extract() {
  const start = Date.now();
  fs.writeFileSync(startedPath, 'Meteor install started');

  const decompressProgress = new cliProgress.SingleBar(
    {
      format: 'Extracting |{bar}| {percentage}% - {fileCount} files completed',
      clearOnComplete: true,
    },
    cliProgress.Presets.shades_classic
  );
  decompressProgress.start(100, 0, {
    fileCount: 0,
  });

  const tarPath = path.resolve(tempPath, tarName);
  // 7Zip is ~15% faster, but doesn't work when the user doesn't have permission to create symlinks
  // TODO: we could always use 7zip if we have it ignore the symlinks, and then manually create them as
  // is done in extractWithTar
  if (canCreateSymlinks) {
    await extractWith7Zip(tarPath, extractPath, ({ percent, fileCount }) => {
      decompressProgress.update(percent, { fileCount });
    });
  } else {
    await extractWithTar(tarPath, extractPath, ({ percent, fileCount }) => {
      decompressProgress.update(percent, { fileCount });
    });
  }

  decompressProgress.stop();
  const end = Date.now();
  console.log(`=> Meteor Extracted ${(end - start) / 1000}s`);
  await setup();
}
async function setup() {
  fs.unlinkSync(startedPath);
  if (shouldSetupExecPath()) {
    await setupExecPath();
  }
  await fixOwnership();
  showGettingStarted();
}
async function setupExecPath() {
  if (isWindows()) {
    // set for the current session and beyond
    child_process.execSync(`setx path "${meteorPath}/;%path%`);
    return;
  }
  const exportCommand = `export PATH=${meteorPath}:$PATH`;

  const appendPathToFile = async file =>
    fsPromises.appendFile(`${rootPath}/${file}`, `${exportCommand}\n`);

  if (process.env.SHELL && process.env.SHELL.includes('zsh')) {
    await appendPathToFile('.zshrc');
  } else {
    await appendPathToFile('.bashrc');
    await appendPathToFile('.bash_profile');
  }
}
async function fixOwnership() {
  if (!isWindows() && isSudo()) {
    // if we identified sudo is being used, we need to change the ownership of the meteorpath folder
    child_process.execSync(`chown -R ${sudoUser} "${meteorPath}"`);
  }
}

function showGettingStarted() {
  const exportCommand = `export PATH=${meteorPath}:$PATH`;

  const runCommand = isWindows()
    ? `set path "${meteorPath}/;%path%`
    : exportCommand;
  const message = `
***************************************

Meteor has been installed!

To get started fast:

  $ meteor create ~/my_cool_app
  $ cd ~/my_cool_app
  $ meteor

Or see the docs at:

  docs.meteor.com

Deploy and host your app with Cloud:

  www.meteor.com/cloud

***************************************
You might need to open a new terminal window to have access to the meteor command, or run this in your terminal:

${runCommand}

For adding it immediately to your path.
***************************************
  `;

  console.log(message);
}
