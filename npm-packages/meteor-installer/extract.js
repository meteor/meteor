const tar = require('tar');
const sevenBin = require('7zip-bin');
const Seven = require('node-7z');
const fs = require('fs');
const { resolve, dirname } = require('path');

function extractWith7Zip (tarPath, destination, onProgress) {
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
  })
}

function createSymlinks(symlinks, baseDir) {
  symlinks.forEach(({ path, linkPath }) => {
    try {
      let resolveBase = resolve(baseDir, dirname(path))
      const result = fs.statSync(resolve(resolveBase, linkPath));

      if (result.isDirectory()) {
        fs.symlinkSync(linkPath, path, 'junction');
      } else {
        fs.copyFileSync(
          resolve(resolveBase, linkPath),
          resolve(baseDir, path),
        )
      }
    } catch (e) {
      console.log(path, linkPath);
      console.error(e);
      throw new Error('Unable to create symlink');
    }
  })
}

function extractWithTar (tarPath, destination, onProgress) {
    let symlinks = [];

    let total = 0;
    // This takes a few seconds, but lets us show the progress
    tar.t({
      sync: true,
      file: tarPath,
      onentry() {
        total += 1;
      }
    });

    let started = 0;
    let timeout = null;

    return new Promise((resolve, reject) => {
      tar.x({
        file: tarPath,
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
        }
      }, (err) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        if (err) {
          return reject(err);
        }
        createSymlinks(symlinks, destination);
        resolve();
      });
    });
}

module.exports = {
  extractWithTar,
  extractWith7Zip,
}
