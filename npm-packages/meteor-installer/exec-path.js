const fs = require('fs');

// Whether meteorPath is already one of the entries in a PATH-like string.
function isMeteorOnPath(pathEnv, meteorPath, delimiter) {
  return (pathEnv || '')
    .split(delimiter)
    .filter(Boolean)
    .includes(meteorPath);
}

// Append a line to a file unless it is already present, so re-running the
// installer doesn't add duplicate `export PATH=...` entries. Returns true if it
// wrote the line.
function appendLineIfMissing(file, line) {
  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch (e) {
    // File may not exist yet; treat as empty.
  }
  if (existing.includes(line)) {
    return false;
  }
  fs.appendFileSync(file, `${line}\n`);
  return true;
}

module.exports = { isMeteorOnPath, appendLineIfMissing };
