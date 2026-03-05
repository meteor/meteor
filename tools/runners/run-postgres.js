var files = require('../fs/files');
var utils = require('../utils/utils.js');
var fiberHelpers = require('../utils/fiber-helpers.js');
var runLog = require('./run-log.js');
var child_process = require('child_process');
var Console = require('../console/console.js').Console;
var https = require('https');
var http = require('http');
var fs = require('fs');
var path = require('path');

// PostgreSQL version to download
var PG_VERSION = '16.6.0';

// Platform mapping for zonkyio/embedded-postgres-binaries
function getPlatformArtifact() {
  var platform = process.platform;
  var arch = process.arch;

  var mapping = {
    'linux-x64': 'linux-amd64',
    'linux-arm64': 'linux-arm64v8',
    'darwin-x64': 'darwin-amd64',
    'darwin-arm64': 'darwin-arm64v8',
    'win32-x64': 'windows-amd64',
  };

  var key = platform + '-' + arch;
  var artifact = mapping[key];

  if (!artifact) {
    throw new Error(
      'Unsupported platform for embedded PostgreSQL: ' + key + '. ' +
      'Supported platforms: ' + Object.keys(mapping).join(', ')
    );
  }

  return artifact;
}

// Construct Maven URL for the embedded postgres binary JAR
function getMavenUrl() {
  var artifact = getPlatformArtifact();
  var groupPath = 'io/zonky/test/postgres';
  var artifactName = 'embedded-postgres-binaries-' + artifact;
  return 'https://repo1.maven.org/maven2/' + groupPath + '/' +
    artifactName + '/' + PG_VERSION + '/' +
    artifactName + '-' + PG_VERSION + '.jar';
}

// Download a file from url to destPath, following redirects
function downloadFile(url, destPath) {
  return new Promise(function (resolve, reject) {
    var file = fs.createWriteStream(destPath);
    var protocol = url.startsWith('https') ? https : http;

    function doRequest(requestUrl) {
      protocol.get(requestUrl, function (response) {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          // Follow redirect
          var redirectUrl = response.headers.location;
          if (redirectUrl.startsWith('https')) {
            https.get(redirectUrl, handleResponse).on('error', reject);
          } else {
            http.get(redirectUrl, handleResponse).on('error', reject);
          }
          return;
        }
        handleResponse(response);
      }).on('error', reject);
    }

    function handleResponse(response) {
      if (response.statusCode !== 200) {
        reject(new Error('Download failed with status ' + response.statusCode + ' from ' + url));
        return;
      }
      response.pipe(file);
      file.on('finish', function () {
        file.close(resolve);
      });
    }

    doRequest(url);
  });
}

// Extract the PostgreSQL binaries from the downloaded JAR
// JAR is a ZIP containing a .tar.xz file with the PG binaries
async function extractBinaries(jarPath, destDir) {
  files.mkdir_p(destDir, 0o755);

  // Use jar/unzip to extract the JAR (it's a ZIP file)
  var tempExtractDir = jarPath + '_extracted';
  files.mkdir_p(tempExtractDir, 0o755);

  // Extract ZIP (JAR) — rename to .zip on Windows since Expand-Archive
  // only accepts .zip extension, and JAR files are ZIP files.
  if (process.platform === 'win32') {
    var zipPath = jarPath.replace(/\.jar$/, '.zip');
    fs.renameSync(files.convertToOSPath(jarPath), files.convertToOSPath(zipPath));
    await spawnAndWait('powershell', [
      '-NoProfile', '-Command',
      'Expand-Archive', '-Path', files.convertToOSPath(zipPath),
      '-DestinationPath', files.convertToOSPath(tempExtractDir), '-Force'
    ]);
    // Restore original name for cleanup
    try { fs.renameSync(files.convertToOSPath(zipPath), files.convertToOSPath(jarPath)); } catch (e) {}
  } else {
    await spawnAndWait('unzip', ['-o', '-q', jarPath, '-d', tempExtractDir]);
  }

  // Find the .tar.xz file inside
  var txzFile = null;
  var extractedFiles = fs.readdirSync(files.convertToOSPath(tempExtractDir));
  for (var i = 0; i < extractedFiles.length; i++) {
    if (extractedFiles[i].endsWith('.txz') || extractedFiles[i].endsWith('.tar.xz')) {
      txzFile = files.pathJoin(tempExtractDir, extractedFiles[i]);
      break;
    }
  }

  if (!txzFile) {
    // Sometimes the txz is in a subdirectory
    function findTxz(dir) {
      var entries = fs.readdirSync(files.convertToOSPath(dir));
      for (var j = 0; j < entries.length; j++) {
        var fullPath = files.pathJoin(dir, entries[j]);
        var osPath = files.convertToOSPath(fullPath);
        if (entries[j].endsWith('.txz') || entries[j].endsWith('.tar.xz')) {
          return fullPath;
        }
        try {
          if (fs.statSync(osPath).isDirectory()) {
            var found = findTxz(fullPath);
            if (found) return found;
          }
        } catch (e) {}
      }
      return null;
    }
    txzFile = findTxz(tempExtractDir);
  }

  if (!txzFile) {
    throw new Error(
      'Could not find .txz or .tar.xz in downloaded PostgreSQL JAR. ' +
      'Contents: ' + extractedFiles.join(', ')
    );
  }

  // Extract tar.xz
  if (process.platform === 'win32') {
    // On Windows, use tar (available on modern Windows 10+)
    await spawnAndWait('tar', [
      'xf', files.convertToOSPath(txzFile),
      '-C', files.convertToOSPath(destDir)
    ]);
  } else {
    await spawnAndWait('tar', [
      'xf', txzFile,
      '-C', destDir
    ]);
  }

  // Clean up temp files
  try {
    await files.rm_recursive_async(tempExtractDir);
    fs.unlinkSync(files.convertToOSPath(jarPath));
  } catch (e) {}

  // chmod +x all binaries (Unix only)
  if (process.platform !== 'win32') {
    var binDir = files.pathJoin(destDir, 'bin');
    if (files.exists(binDir)) {
      var binFiles = fs.readdirSync(files.convertToOSPath(binDir));
      binFiles.forEach(function (f) {
        try {
          fs.chmodSync(files.convertToOSPath(files.pathJoin(binDir, f)), 0o755);
        } catch (e) {}
      });
    }
  }
}

function spawnAndWait(cmd, args) {
  return new Promise(function (resolve, reject) {
    var proc = child_process.spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...process.platform === 'win32' && { shell: true },
    });
    var stderr = '';
    proc.stderr.on('data', function (data) { stderr += data; });
    proc.on('close', function (code) {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(cmd + ' exited with code ' + code + ': ' + stderr));
      }
    });
    proc.on('error', reject);
  });
}

// Get the path to the PostgreSQL binary directory
function pgBinDir() {
  return files.pathJoin(files.getDevBundle(), 'postgresql', 'bin');
}

function pgBinary(name) {
  var binName = process.platform === 'win32' ? name + '.exe' : name;
  return files.pathJoin(pgBinDir(), binName);
}

// Check if PostgreSQL binaries are already downloaded
function areBinariesPresent() {
  return files.exists(pgBinary('postgres'));
}

// Download and extract PostgreSQL binaries if not present
async function ensureBinaries() {
  if (areBinariesPresent()) {
    return;
  }

  var destDir = files.pathJoin(files.getDevBundle(), 'postgresql');
  files.mkdir_p(destDir, 0o755);

  Console.info('Downloading PostgreSQL ' + PG_VERSION + ' binaries...');

  var url = getMavenUrl();
  var tempJar = files.pathJoin(destDir, 'postgres-binaries.jar');

  try {
    await downloadFile(url, files.convertToOSPath(tempJar));
  } catch (e) {
    throw new Error(
      'Failed to download PostgreSQL binaries from ' + url + ': ' + e.message +
      '\nYou can manually set POSTGRES_URL to use an external PostgreSQL server.'
    );
  }

  Console.info('Extracting PostgreSQL binaries...');

  try {
    await extractBinaries(tempJar, destDir);
  } catch (e) {
    // Clean up on failure
    try { await files.rm_recursive_async(destDir); } catch (e2) {}
    throw new Error(
      'Failed to extract PostgreSQL binaries: ' + e.message +
      '\nYou can manually set POSTGRES_URL to use an external PostgreSQL server.'
    );
  }

  if (!areBinariesPresent()) {
    throw new Error(
      'PostgreSQL binaries were extracted but postgres binary was not found at expected location. ' +
      'Expected: ' + pgBinary('postgres')
    );
  }

  Console.info('PostgreSQL binaries installed.');
}

// Run initdb if the data directory doesn't exist.
// Returns true if freshly initialized, false if already existed.
async function ensureDataDir(pgDataDir) {
  var versionFile = files.pathJoin(pgDataDir, 'PG_VERSION');
  if (files.exists(versionFile)) {
    return false;
  }

  files.mkdir_p(pgDataDir, 0o755);

  Console.info('Initializing PostgreSQL data directory...');

  var initdbPath = pgBinary('initdb');
  var osDataDir = files.convertToOSPath(pgDataDir);
  var osInitdb = files.convertToOSPath(initdbPath);

  await spawnAndWait(osInitdb, [
    '-D', osDataDir,
    '--auth=trust',
    '--username=meteor',
    '--encoding=UTF8',
    '--no-locale',
  ]);

  return true;
}

// Create the 'meteor' database using postgres in single-user mode.
// This runs BEFORE the server starts, so no TCP connection is needed.
// Only called after a fresh initdb (the database persists across restarts).
async function createMeteorDatabase(pgDataDir) {
  var postgresPath = files.convertToOSPath(pgBinary('postgres'));
  var osDataDir = files.convertToOSPath(pgDataDir);

  Console.info('Creating "meteor" database...');

  return new Promise(function (resolve, reject) {
    var args = ['--single', '-D', osDataDir, 'postgres'];
    if (process.platform === 'win32') {
      args = ['--single', '-D', '"' + osDataDir + '"', 'postgres'];
    }

    var proc = child_process.spawn(postgresPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...process.platform === 'win32' && { shell: true },
    });

    var stderr = '';
    proc.stderr.on('data', function (data) { stderr += data; });

    proc.stdin.write('CREATE DATABASE meteor;\n');
    proc.stdin.end();

    proc.on('close', function (code) {
      // postgres --single exits 0 on success
      if (code === 0) {
        resolve();
      } else {
        // If the database already exists, that's fine
        if (stderr.indexOf('already exists') !== -1) {
          resolve();
        } else {
          reject(new Error('Failed to create meteor database (exit ' + code + '): ' + stderr.slice(-500)));
        }
      }
    });
    proc.on('error', reject);
  });
}

// Spawn the postgres server and wait for it to be ready
function spawnPostgres(pgDataDir, port) {
  var postgresPath = files.convertToOSPath(pgBinary('postgres'));
  var osDataDir = files.convertToOSPath(pgDataDir);

  var args = [
    '-D', osDataDir,
    '-p', '' + port,
    '-k', '',  // disable Unix domain sockets, TCP only
  ];

  if (process.platform === 'win32') {
    postgresPath = '"' + postgresPath + '"';
    osDataDir = '"' + osDataDir + '"';
    args = [
      '-D', osDataDir,
      '-p', '' + port,
    ];
  }

  return child_process.spawn(postgresPath, args, {
    env: Object.assign({}, process.env),
    stdio: ['ignore', 'pipe', 'pipe'],
    ...process.platform === 'win32' && { shell: true },
  });
}

// Wait for postgres to be ready to accept connections
function waitForReady(proc) {
  return new Promise(function (resolve, reject) {
    var stderrData = '';
    var resolved = false;

    function checkReady(data) {
      stderrData += data;
      // PostgreSQL logs "database system is ready to accept connections" to stderr
      if (!resolved && /database system is ready to accept connections/.test(stderrData)) {
        resolved = true;
        resolve();
      }
    }

    // PostgreSQL logs to stderr by default
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', checkReady);

    // Also check stdout just in case
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', checkReady);

    proc.on('exit', function (code, signal) {
      if (!resolved) {
        resolved = true;
        reject(new Error(
          'PostgreSQL exited before becoming ready (code=' + code +
          ', signal=' + signal + '). Output: ' + stderrData.slice(-500)
        ));
      }
    });

    proc.on('error', function (err) {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Timeout after 30 seconds
    setTimeout(function () {
      if (!resolved) {
        resolved = true;
        reject(new Error(
          'PostgreSQL did not become ready within 30 seconds. Output: ' +
          stderrData.slice(-500)
        ));
      }
    }, 30000);
  });
}

// This runs a PostgreSQL process and restarts it if it fails. If it
// restarts too often, we give up and call onFailure.
//
// options: projectLocalDir, port, onFailure
var PostgresRunner = function (options) {
  var self = this;
  self.projectLocalDir = options.projectLocalDir;
  self.port = options.port;
  self.onFailure = options.onFailure;

  self.proc = null;
  self.shuttingDown = false;
  self.resolveStartupPromise = null;

  self.errorCount = 0;
  self.errorTimer = null;
  self.restartTimer = null;
};

var PRp = PostgresRunner.prototype;

Object.assign(PRp, {
  // Blocks until the server has started for the first time and
  // is accepting connections.
  start: async function () {
    var self = this;

    if (self.proc) {
      throw new Error('already running?');
    }

    await self._startOrRestart();

    // Did we properly start up?
    if (self.proc) {
      return;
    }

    // Are we shutting down?
    if (self.shuttingDown) {
      return;
    }

    // Otherwise, wait for a successful _startOrRestart, or a failure.
    if (!self.resolveStartupPromise) {
      await new Promise(function (resolve) {
        self.resolveStartupPromise = resolve;
      });
    }
  },

  _startOrRestart: async function () {
    var self = this;

    if (self.proc) {
      throw new Error('already running?');
    }

    try {
      // Step 1: Ensure binaries are downloaded
      await ensureBinaries();

      // Step 2: Ensure data directory is initialized
      var pgDataDir = files.pathJoin(self.projectLocalDir, 'pgdata');
      await ensureDataDir(pgDataDir);

      // Step 2b: Create meteor database (idempotent, runs before server starts)
      await createMeteorDatabase(pgDataDir);

      // Step 3: Remove stale postmaster.pid if it exists
      var pidFile = files.pathJoin(pgDataDir, 'postmaster.pid');
      if (files.exists(pidFile)) {
        try {
          var pidContent = fs.readFileSync(
            files.convertToOSPath(pidFile), 'utf8'
          );
          var pid = parseInt(pidContent.split('\n')[0], 10);
          if (pid) {
            try {
              process.kill(pid, 0);
              // Process is still alive — try to kill it
              process.kill(pid, 'SIGTERM');
              await utils.sleepMs(1000);
            } catch (e) {
              // Process not running, remove stale pid file
            }
          }
          // Remove stale pidfile if process is gone
          try {
            process.kill(pid, 0);
          } catch (e) {
            fs.unlinkSync(files.convertToOSPath(pidFile));
          }
        } catch (e) {
          // Ignore errors reading/removing pid file
        }
      }

      // Step 4: Spawn postgres
      self.proc = spawnPostgres(pgDataDir, self.port);

      // Set up exit handler
      self.proc.on('exit', fiberHelpers.bindEnvironment(
        async function (code, signal) {
          self.proc = null;
          await self._exited(code, signal);
        }
      ));

      // Register cleanup handler
      require('../tool-env/cleanup.js').onExit(function () {
        if (self.proc) {
          self.proc.kill('SIGINT');
          self.proc = null;
        }
      });

      // Step 5: Wait for ready
      await waitForReady(self.proc);

      self._allowStartupToReturn();
    } catch (e) {
      runLog.log('Error starting PostgreSQL: ' + e.message);
      self.proc = null;
      await self._exited(1, null);
    }
  },

  _exited: async function (code, signal) {
    var self = this;

    if (self.shuttingDown) {
      return;
    }

    if (code !== null && code !== 0) {
      runLog.log('PostgreSQL exited with code ' + code + '. Restarting.');
    }

    // Track consecutive errors for restart limiting
    self.errorCount++;
    if (self.errorTimer) {
      clearTimeout(self.errorTimer);
    }
    self.errorTimer = setTimeout(function () {
      self.errorTimer = null;
      self.errorCount = 0;
    }, 5000);

    if (self.errorCount < 3) {
      // Wait a second, then restart
      self.restartTimer = setTimeout(
        fiberHelpers.bindEnvironment(async function () {
          self.restartTimer = null;
          await self._startOrRestart();
        }),
        1000
      );
      return;
    }

    // Too many restarts
    var message = "Can't start PostgreSQL server.";
    message += '\n\nCheck for other processes listening on port ' +
      self.port + ' or check the PostgreSQL logs in .meteor/local/pgdata/';
    runLog.log(message);
    self._fail();
  },

  // Idempotent
  stop: function () {
    var self = this;

    if (self.shuttingDown) {
      return;
    }

    self.shuttingDown = true;

    self.errorTimer && clearTimeout(self.errorTimer);
    self.restartTimer && clearTimeout(self.restartTimer);

    if (self.proc) {
      // Send SIGINT for fast shutdown
      self.proc.kill('SIGINT');

      // Give it up to 10 seconds, then SIGKILL
      var proc = self.proc;
      setTimeout(function () {
        if (proc) {
          try {
            proc.kill('SIGKILL');
          } catch (e) {}
        }
      }, 10000);

      self.proc = null;
    }
  },

  _allowStartupToReturn: function () {
    var self = this;
    if (self.resolveStartupPromise) {
      var resolve = self.resolveStartupPromise;
      self.resolveStartupPromise = null;
      resolve();
    }
  },

  _fail: async function () {
    var self = this;
    self.stop();
    self.onFailure && await self.onFailure();
    self._allowStartupToReturn();
  },

  postgresUrl: function () {
    var self = this;
    return 'postgresql://meteor@127.0.0.1:' + self.port + '/meteor';
  },
});

exports.PostgresRunner = PostgresRunner;
