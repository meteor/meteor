const fs = require('node:fs');
const path = require('node:path');

function createMeteorSnapshotEnvironment({ appRoot }) {
  const root = path.resolve(appRoot);
  let writeQueue = Promise.resolve();

  function resolveOwnedPath(filepath) {
    if (typeof filepath !== 'string' || filepath.length === 0) {
      throw new TypeError('[Meteor Rstest] Snapshot path must be a non-empty string.');
    }
    const resolved = path.resolve(root, filepath);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)) {
      throw new TypeError(
        '[Meteor Rstest] Snapshot path must stay inside application root.',
      );
    }
    return resolved;
  }

  function serializeWrite(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  return {
    getVersion: () => '1',
    getHeader: () => '// Rstest Snapshot v1',

    async resolvePath(filepath) {
      const testPath = resolveOwnedPath(filepath);
      return path.join(
        path.dirname(testPath),
        '__snapshots__',
        `${path.basename(testPath)}.snap`,
      );
    },

    async resolveRawPath(testPath, rawPath) {
      const ownedTestPath = resolveOwnedPath(testPath);
      return resolveOwnedPath(path.resolve(path.dirname(ownedTestPath), rawPath));
    },

    async saveSnapshotFile(filepath, snapshot) {
      const ownedPath = resolveOwnedPath(filepath);
      return serializeWrite(async () => {
        await fs.promises.mkdir(path.dirname(ownedPath), { recursive: true });
        const temporaryPath = `${ownedPath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.writeFile(temporaryPath, snapshot, 'utf8');
        await fs.promises.rename(temporaryPath, ownedPath);
      });
    },

    async readSnapshotFile(filepath) {
      const ownedPath = resolveOwnedPath(filepath);
      try {
        return await fs.promises.readFile(ownedPath, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },

    async removeSnapshotFile(filepath) {
      const ownedPath = resolveOwnedPath(filepath);
      return serializeWrite(async () => {
        try {
          await fs.promises.unlink(ownedPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      });
    },
  };
}

module.exports = { createMeteorSnapshotEnvironment };
