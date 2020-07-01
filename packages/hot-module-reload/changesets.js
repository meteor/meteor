function createId () {
  return `${Date.now()}-${Math.random()}`
}

function comparePrelinkResult(previousResult, {
  name,
  module,
}) {
  const {
    fileHashes: previousFileHashes,
    unreloadableHashes: previousUnreloadable,
  } = previousResult || {};

  const {
    addedFiles,
    changedFiles,
    removedFilePaths,
    unreloadable,
    unreloadableChanged,
    fileHashes
  } = compareFiles(
    previousFileHashes,
    previousUnreloadable,
    module.files
  );

  const canCompare = !!previousFileHashes;
  const reloadable = canCompare && !unreloadableChanged

  function fileDetailsToSave (file) {
    return {
      content: file.getPrelinkedOutput({}).toStringWithSourceMap({}),
      path: file.absModuleId,
      meteorInstallOptions: file.meteorInstallOptions
    }
  }

  const result = {
    fileHashes,
    unreloadableHashes: unreloadable,
    removedFilePaths,
    reloadable,
    addedFiles: reloadable ? addedFiles.map(fileDetailsToSave) : [],
    changedFiles: reloadable ? changedFiles.map(fileDetailsToSave) : [],
    linkedAt: Date.now(),
    id: createId(),
    name
  };

  return result;
}

function checkReloadable(file) {
  return file.absModuleId &&
    !file.bare &&
    !file.jsonData &&
    file.meteorInstallOptions
}

function compareFiles(previousHashes = new Map(), previousUnreloadable = [], currentFiles) {
  const unreloadable = [];
  const currentHashes = new Map();
  const unseenModules = new Map(previousHashes);

  const changedFiles = [];
  const addedFiles = [];

  currentFiles.forEach(file => {
    if (
      !checkReloadable(file)
    ) {
      // TODO: we should be using more than just the hash
      unreloadable.push(file._inputHash);
      return;
    }

    // TODO: we should be using more than just the hash
    currentHashes.set(file.absModuleId, file._inputHash);

    const previousHash = previousHashes.get(file.absModuleId);

    if (!previousHash) {
      addedFiles.push(file);
    } else if (previousHash !== file._inputHash) {
      changedFiles.push(file);
    }

    unseenModules.delete(file.absModuleId);
  });

  const removedFilePaths = Array.from(unseenModules.keys());
  const unreloadableChanged = unreloadable.length !== previousUnreloadable.length ||
    unreloadable.some((hash, i) => hash !== previousUnreloadable[i]);

  return {
    fileHashes: currentHashes,
    addedFiles,
    changedFiles,
    removedFilePaths,
    unreloadable,
    unreloadableChanged,
  };
};

module.exports = {
  comparePrelinkResult
}
