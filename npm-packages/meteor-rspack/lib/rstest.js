const fs = require('node:fs');
const path = require('node:path');

function readRstestRuntimeInventory({ manifest, projectDir, client }) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  } catch {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  if (Array.isArray(parsed)) {
    return {
      discoveryRoot: path.resolve(
        projectDir,
        `tests/rstest/runtime/${client ? 'client' : 'server'}`,
      ),
      files: parsed,
    };
  }
  if (!parsed || parsed.schemaVersion !== 2 ||
      !Array.isArray(parsed.serverFiles) || !Array.isArray(parsed.clientFiles)) {
    throw new Error('[Meteor Rstest] Invalid runtime file inventory from Meteor CLI.');
  }
  return {
    discoveryRoot: path.resolve(projectDir),
    files: client ? parsed.clientFiles : parsed.serverFiles,
  };
}

module.exports = { readRstestRuntimeInventory };
