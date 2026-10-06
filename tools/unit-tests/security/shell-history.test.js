const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { transformSync } = require('@swc/core');

function historySession(directory, filesystem = fs, globals = {}) {
  const filename = path.resolve(__dirname, '../../../packages/shell-server/shell-server.js');
  const code = transformSync(fs.readFileSync(filename, 'utf8'), {
    jsc: { parser: { syntax: 'ecmascript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code + '\nmodule.exports.HistoryServer = Server;', {
    ...globals, module, exports: module.exports,
    require(name) {
      if (name === 'meteor/inter-process-messaging') return {};
      if (name === 'fs') return filesystem;
      return require(name);
    },
  }, { filename });
  const session = Object.create(module.exports.HistoryServer.prototype);
  session.shellDir = directory;
  session.repl = new EventEmitter();
  return session;
}

const posixTest = process.platform === 'win32' ? test.skip : test;
let directory;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-history-test-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

posixTest('new history is private at creation even with a permissive umask', () => {
  let initialMode;
  const session = historySession(directory, {
    ...fs,
    openSync(...args) {
      const fd = fs.openSync(...args);
      initialMode = fs.fstatSync(fd).mode & 0o777;
      return fd;
    },
  });
  const previousUmask = process.umask(0);
  try {
    session.initializeHistory();
    expect(initialMode).toBe(0o600);
  } finally {
    process.umask(previousUmask);
    session.repl.emit('exit');
  }
});

posixTest('existing history is made private while preserving loading, append and reopen', () => {
  const filename = path.join(directory, 'history');
  fs.writeFileSync(filename, 'first\nsecond\nfirst\n');
  fs.chmodSync(filename, 0o666);
  const session = historySession(directory);
  try {
    session.initializeHistory();
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
    expect(Array.from(session.repl.history)).toEqual(['first', 'second']);
    session.repl.emit('line', 'third');
  } finally {
    session.repl.emit('exit');
  }
  expect(fs.readFileSync(filename, 'utf8')).toBe('first\nsecond\nfirst\nthird\n');
  const reopened = historySession(directory);
  try {
    reopened.initializeHistory();
    expect(Array.from(reopened.repl.history)).toEqual(['third', 'first', 'second']);
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  } finally {
    reopened.repl.emit('exit');
  }
});

posixTest('history linked to /dev/null to disable it keeps working', () => {
  fs.symlinkSync('/dev/null', path.join(directory, 'history'));
  const session = historySession(directory);
  try {
    session.initializeHistory();
    expect(Array.from(session.repl.history)).toEqual([]);
    session.repl.emit('line', 'discarded');
  } finally {
    session.repl.emit('exit');
  }
});

test('failed permission repair closes the descriptor and installs no history listener', () => {
  let openedFd;
  const session = historySession(directory, {
    ...fs,
    openSync(...args) { return openedFd = fs.openSync(...args); },
    fchmodSync() { throw new Error('synthetic permission failure'); },
  });
  try {
    expect(() => session.initializeHistory()).toThrow('synthetic permission failure');
    expect(() => fs.fstatSync(openedFd)).toThrow();
    expect(session.repl.listenerCount('line')).toBe(0);
  } finally {
    try { fs.closeSync(openedFd); } catch {}
  }
});

function compileSession(directory, filesystem = fs) {
  const compiled = [];
  const session = historySession(directory, filesystem, {
    global: {},
    Package: { 'babel-compiler': { Babel: { compileForShell(code, cacheOptions) {
      // Like @meteorjs/babel, which creates the directory with default modes.
      if (cacheOptions) fs.mkdirSync(cacheOptions.cacheDirectory, { recursive: true });
      compiled.push(cacheOptions);
      return code;
    } } } },
  });
  session.startREPL({
    input: new PassThrough(), output: new PassThrough(),
    terminal: false, prompt: '', useGlobal: false,
  });
  session._wrappedDefaultEval('"synthetic secret"', {}, '<meteor shell>', () => {});
  session.repl.close();
  return compiled;
}

posixTest('compiled shell commands are only cached in a private directory', () => {
  const cacheDirectory = path.join(directory, 'cache');
  const previousUmask = process.umask(0);
  try {
    expect(compileSession(directory)).toEqual([{ cacheDirectory }]);
    expect(fs.statSync(cacheDirectory).mode & 0o777).toBe(0o700);
  } finally {
    process.umask(previousUmask);
  }
  fs.chmodSync(cacheDirectory, 0o755);
  expect(compileSession(directory)).toEqual([{ cacheDirectory }]);
  expect(fs.statSync(cacheDirectory).mode & 0o777).toBe(0o700);
});

test('shell commands are not cached when the cache directory cannot be made private', () => {
  const compiled = compileSession(directory, {
    ...fs,
    chmodSync() { throw new Error('synthetic permission failure'); },
  });
  expect(compiled).toEqual([false]);
});
