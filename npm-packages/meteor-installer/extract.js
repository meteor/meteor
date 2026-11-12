const sevenBin = require('7zip-bin');
const child_process = require('child_process');
const fs = require('fs');
const Seven = require('node-7z');
const { resolve, dirname, relative, isAbsolute, win32, sep } = require('path');
const tar = require('tar');

const { isLinux } = require('./config.js');

function extractWith7Zip(tarPath, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const stream = Seven.extractFull(tarPath, destination, {
      $progress: true,
      $bin: sevenBin.path7za,
    });
    stream.on('progress', function (progress) {
      onProgress(progress);
    });

    stream.on('error', function (err) {
      return reject(err);
    });

    stream.on('end', function () {
      return resolve();
    });
  });
}

function createSymlinks(symlinks, baseDir) {
  baseDir = fs.realpathSync(baseDir);
  const inside = target => {
    const name = relative(baseDir, target);
    if (isAbsolute(name) || name === '..' || name.startsWith(`..${sep}`)) {
      throw new Error('Archive link escapes the extraction directory');
    }
    return target;
  };
  symlinks.forEach(({ path, linkPath }) => {
    try {
      if (win32.isAbsolute(path) || win32.isAbsolute(linkPath) ||
          /^[a-z]:/i.test(path) || /^[a-z]:/i.test(linkPath)) {
        throw new Error('Absolute archive links are not supported');
      }
      const output = inside(resolve(baseDir, path.replace(/\\/g, '/')));
      inside(fs.realpathSync(dirname(output)));
      const target = inside(resolve(dirname(output), linkPath.replace(/\\/g, '/')));
      inside(fs.realpathSync(target));
      const result = fs.statSync(target);

      if (result.isDirectory()) {
        fs.symlinkSync(target, output, 'junction');
      } else {
        fs.copyFileSync(target, output, fs.constants.COPYFILE_EXCL);
      }
    } catch (e) {
      console.log(path, linkPath);
      console.error(e);
      throw new Error('Unable to create symlink');
    }
  });
}

function extractWithNativeTar(tarPath, destination) {
  child_process.execSync(
    `tar -xf "${tarPath}" ${
      isLinux() ? `--checkpoint-action=ttyout="#%u: %T \r"` : ``
    } -C "${destination}"`,
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: [process.stdin, process.stdout, process.stderr],
      encoding: 'utf-8',
    },
  );
}

async function extractWithTar(tarPath, destination, onProgress) {
  const symlinks = [];

  let total = 0;
  // This takes a few seconds, but lets us show the progress
  tar.t({
    sync: true,
    file: tarPath,
    onentry() {
      total += 1;
    },
  });

  let started = 0;
  let timeout = null;

  try {
    await tar.x(
      {
        file: tarPath,
        strict: true,
        cwd: destination,
        filter(path, entry) {
          if (entry.type === 'SymbolicLink') {
            symlinks.push({
              path: entry.path,
              linkPath: entry.linkpath,
            });
            return false;
          }

          return true;
        },
        onentry() {
          started += 1;

          if (!timeout) {
            timeout = setTimeout(() => {
              timeout = null;
              onProgress({
                percent: (started / total) * 100,
                fileCount: started,
              });
            }, 300);
          }
        },
      },
    );
    createSymlinks(symlinks, destination);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  extractWithTar,
  extractWith7Zip,
  extractWithNativeTar,
};
