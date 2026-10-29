const fs = require('fs');
const path = require('path');

// Expand `%VAR%` references the way Windows does for REG_EXPAND_SZ values.
// Variable names are case-insensitive on Windows; unknown names are kept as-is.
function expandWindowsEnvVars(value, env = {}) {
  return value.replace(/%([^%;]+)%/g, (match, name) => {
    const key = Object.keys(env).find(
      k => k.toUpperCase() === name.toUpperCase(),
    );
    return key === undefined ? match : env[key];
  });
}

// Normalize a PATH entry so equivalent spellings compare equal: a trailing
// separator is ignored (`~/.meteor/` === `~/.meteor`). With `windows: true`,
// entries are also unquoted, `%VAR%`-expanded (the user PATH in the registry is
// stored unexpanded), slash-normalized and compared case-insensitively.
function normalizePathEntry(entry, { windows = false, env = {} } = {}) {
  let p = entry.trim();
  if (!windows) {
    return p.length > 1 ? p.replace(/\/+$/, '') : p;
  }
  p = p.replace(/^"(.*)"$/, '$1');
  p = path.win32.normalize(expandWindowsEnvVars(p, env));
  return p.replace(/[\\/]+$/, '').toLowerCase();
}

// Whether meteorPath is already one of the entries in a PATH-like string.
function isMeteorOnPath(pathEnv, meteorPath, delimiter, options) {
  const target = normalizePathEntry(meteorPath, options);
  return (pathEnv || '')
    .split(delimiter)
    .filter(entry => entry.trim())
    .some(entry => normalizePathEntry(entry, options) === target);
}

// Whether `line` is present in a shell rc file as an active line. A
// commented-out copy (`# export PATH=...`) does not count, so it can't block a
// repair. Indentation, CRLF line endings and a trailing `# comment` are
// tolerated. Other spellings of the same export are deliberately not
// recognised: appending our line next to them only duplicates a PATH entry,
// while wrongly treating a line as present would leave meteor off the PATH.
function hasActiveLine(content, line) {
  return content.split('\n').some(raw => {
    const code = raw.trim();
    if (!code || code.startsWith('#')) {
      return false;
    }
    return code.replace(/\s+#.*$/, '') === line;
  });
}

// Append a line to a file unless it is already active there, so re-running the
// installer doesn't add duplicate `export PATH=...` entries. Returns true if it
// wrote the line. Errors other than a missing file are thrown to the caller.
function appendLineIfMissing(file, line) {
  let existing = '';
  try {
    existing = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
  if (hasActiveLine(existing, line)) {
    return false;
  }
  // Don't glue our line onto a last line that has no trailing newline.
  const separator = existing && !existing.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, `${separator}${line}\n`);
  return true;
}

// The login file bash actually reads: the first of ~/.bash_profile,
// ~/.bash_login and ~/.profile that exists (see "Bash Startup Files" in the
// bash manual). Creating ~/.bash_profile when only ~/.profile exists (the
// Debian/Ubuntu default) would make login shells skip ~/.profile entirely.
function bashLoginFile(rootPath, exists = fs.existsSync) {
  const candidates = ['.bash_profile', '.bash_login', '.profile'];
  return (
    candidates.find(file => exists(path.join(rootPath, file))) ||
    '.bash_profile'
  );
}

module.exports = {
  appendLineIfMissing,
  bashLoginFile,
  expandWindowsEnvVars,
  hasActiveLine,
  isMeteorOnPath,
  normalizePathEntry,
};
