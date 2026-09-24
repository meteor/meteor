const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  appendLineIfMissing,
  bashLoginFile,
  expandWindowsEnvVars,
  hasActiveLine,
  isMeteorOnPath,
} = require('./exec-path');

const line = 'export PATH=/home/u/.meteor:$PATH';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-path-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('isMeteorOnPath finds meteor already on PATH', () => {
  const meteor = '/home/u/.meteor';
  assert.equal(isMeteorOnPath(`/usr/bin:${meteor}:/bin`, meteor, ':'), true);
  assert.equal(isMeteorOnPath('/usr/bin:/bin', meteor, ':'), false);
  assert.equal(isMeteorOnPath('', meteor, ':'), false);
  assert.equal(isMeteorOnPath(undefined, meteor, ':'), false);
  // a prefix match must not count as present
  assert.equal(isMeteorOnPath('/home/u/.meteorx:/bin', meteor, ':'), false);
  // a trailing slash is the same directory
  assert.equal(isMeteorOnPath(`/usr/bin:${meteor}/`, meteor, ':'), true);
});

test('isMeteorOnPath on Windows ignores case, slashes and %VARS%', () => {
  const meteor = 'C:\\Users\\U\\AppData\\Local\\.meteor';
  const options = {
    windows: true,
    env: { LOCALAPPDATA: 'C:\\Users\\U\\AppData\\Local' },
  };
  const on = pathEnv => isMeteorOnPath(pathEnv, meteor, ';', options);
  assert.equal(on('C:\\Windows;c:\\users\\u\\appdata\\local\\.meteor'), true);
  // older installers (setx) wrote `${meteorPath}/`
  assert.equal(on('C:\\Users\\U\\AppData\\Local\\.meteor/;C:\\Windows'), true);
  assert.equal(on('C:\\Users\\U\\AppData\\Local\\.meteor\\'), true);
  // the registry user PATH is read unexpanded
  assert.equal(on('%LocalAppData%\\.meteor;C:\\Windows'), true);
  assert.equal(on('"C:\\Users\\U\\AppData\\Local\\.meteor"'), true);
  assert.equal(on('C:\\Users\\U\\AppData\\Local\\.meteorx;C:\\Windows'), false);
  assert.equal(on('%UNKNOWN%\\.meteor'), false);
  assert.equal(on(''), false);
});

test('expandWindowsEnvVars keeps unknown variables', () => {
  assert.equal(
    expandWindowsEnvVars('%userprofile%\\bin;%NOPE%', {
      USERPROFILE: 'C:\\Users\\U',
    }),
    'C:\\Users\\U\\bin;%NOPE%',
  );
});

test('hasActiveLine ignores commented-out copies of the line', () => {
  assert.equal(hasActiveLine(`${line}\n`, line), true);
  assert.equal(hasActiveLine(`# ${line}\n`, line), false);
  assert.equal(hasActiveLine(`#${line}\n`, line), false);
  assert.equal(hasActiveLine(`   # ${line}\n`, line), false);
  assert.equal(hasActiveLine(`# old: ${line}\n`, line), false);
});

test('hasActiveLine tolerates indentation, CRLF and trailing comments', () => {
  assert.equal(hasActiveLine(`if true; then\n  ${line}\nfi\n`, line), true);
  assert.equal(hasActiveLine(`\t${line}`, line), true);
  assert.equal(hasActiveLine(`alias a=b\r\n${line}\r\n`, line), true);
  assert.equal(hasActiveLine(`alias a=b\r\n# ${line}\r\n`, line), false);
  assert.equal(hasActiveLine(`${line} # added by meteor\n`, line), true);
});

test('hasActiveLine does not match the line inside another command', () => {
  assert.equal(hasActiveLine(`${line}:/opt/bin\n`, line), false);
  assert.equal(hasActiveLine(`echo '${line}'\n`, line), false);
  assert.equal(hasActiveLine('', line), false);
});

test('appendLineIfMissing appends once and is idempotent', () => {
  withTempDir(dir => {
    const file = path.join(dir, '.bashrc');
    fs.writeFileSync(file, '# existing\n');
    assert.equal(appendLineIfMissing(file, line), true, 'writes when missing');
    assert.equal(appendLineIfMissing(file, line), false, 'skips when present');
    const occurrences = fs.readFileSync(file, 'utf8').split(line).length - 1;
    assert.equal(occurrences, 1, 'the line appears exactly once');
  });
});

test('appendLineIfMissing creates a missing file', () => {
  withTempDir(dir => {
    const file = path.join(dir, '.zshrc');
    assert.equal(appendLineIfMissing(file, line), true);
    assert.equal(fs.readFileSync(file, 'utf8'), `${line}\n`);
  });
});

test('appendLineIfMissing repairs a commented-out PATH line', () => {
  withTempDir(dir => {
    const file = path.join(dir, '.zshrc');
    fs.writeFileSync(file, `# ${line}\n`);
    assert.equal(appendLineIfMissing(file, line), true);
    assert.equal(fs.readFileSync(file, 'utf8'), `# ${line}\n${line}\n`);
  });
});

test('appendLineIfMissing does not glue onto a last line without newline', () => {
  withTempDir(dir => {
    const file = path.join(dir, '.zshrc');
    fs.writeFileSync(file, "alias ll='ls -l'");
    assert.equal(appendLineIfMissing(file, line), true);
    assert.equal(fs.readFileSync(file, 'utf8'), `alias ll='ls -l'\n${line}\n`);
  });
});

test('appendLineIfMissing surfaces errors for an unusable rc path', () => {
  withTempDir(dir => {
    // a directory where the rc file should be: EISDIR, not "missing"
    const file = path.join(dir, '.zshrc');
    fs.mkdirSync(file);
    assert.throws(() => appendLineIfMissing(file, line));
  });
});

test('bashLoginFile picks the login file bash will actually read', () => {
  const root = path.join(path.sep, 'home', 'u');
  const existing = files => file => files.includes(path.basename(file));
  assert.equal(bashLoginFile(root, existing([])), '.bash_profile');
  assert.equal(bashLoginFile(root, existing(['.profile'])), '.profile');
  assert.equal(
    bashLoginFile(root, existing(['.bash_login', '.profile'])),
    '.bash_login',
  );
  assert.equal(
    bashLoginFile(root, existing(['.bash_profile', '.profile'])),
    '.bash_profile',
  );
});
