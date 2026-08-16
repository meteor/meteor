function createMeteorClientSnapshotEnvironment({
  callAsync,
  generation,
  token,
}) {
  if (typeof callAsync !== 'function') {
    throw new TypeError('[Meteor Rstest] Client snapshot RPC must be a function.');
  }

  const call = (operation, fields = {}) => callAsync('rstest/snapshot', {
    protocolVersion: 1,
    generation,
    token,
    operation,
    ...fields,
  });

  return {
    getVersion: () => '1',
    getHeader: () => '// Rstest Snapshot v1',
    resolvePath: filepath => call('resolvePath', { filepath }),
    resolveRawPath: (testPath, rawPath) => call('resolveRawPath', {
      testPath,
      rawPath,
    }),
    saveSnapshotFile: (filepath, snapshot) => call('save', {
      filepath,
      snapshot,
    }),
    readSnapshotFile: filepath => call('read', { filepath }),
    removeSnapshotFile: filepath => call('remove', { filepath }),
  };
}

module.exports = { createMeteorClientSnapshotEnvironment };
