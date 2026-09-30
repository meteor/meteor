const execa = require('execa');
const waitOn = require('wait-on');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const rimraf = require('rimraf');

// Get the absolute path to the meteor executable
const REPO_ROOT = path.resolve(__dirname, '../..');
const METEOR_EXECUTABLE = path.join(REPO_ROOT, 'meteor');

/**
 * Returns true when the current Jest test is a retry attempt.
 */
export function isRetryAttempt() {
  return Boolean(globalThis.__e2eIsRetryAttempt);
}

/**
 * Snapshot file contents so they can be restored after a test mutates them.
 * @param {string} baseDir - Base directory for relative paths
 * @param {string[]} relPaths - Relative paths to snapshot
 * @returns {Promise<Map<string, {content: string|null, existed: boolean}>>}
 */
export async function snapshotFiles(baseDir, relPaths = []) {
  const snapshot = new Map();
  for (const relPath of relPaths) {
    if (!relPath) continue;
    const fullPath = path.join(baseDir, relPath);
    if (await fs.pathExists(fullPath)) {
      const content = await fs.readFile(fullPath, 'utf8');
      snapshot.set(fullPath, { content, existed: true });
    } else {
      snapshot.set(fullPath, { content: null, existed: false });
    }
  }
  return snapshot;
}

/**
 * Restore files captured by snapshotFiles to their original state.
 * @param {Map<string, {content: string|null, existed: boolean}>} snapshot
 */
export async function restoreFiles(snapshot) {
  if (!snapshot || snapshot.size === 0) return;
  for (const [fullPath, entry] of snapshot.entries()) {
    if (entry.existed) {
      await fs.writeFile(fullPath, entry.content, 'utf8');
    } else if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
    }
  }
}

/**
 * Remove build artifacts and caches under a Meteor app directory.
 * @param {string} appDir - Directory containing the Meteor app
 */
export async function clearBuildArtifacts(appDir) {
  if (!appDir) return;
  const targets = [
    '_build',
    '.meteor/local/build',
    '.meteor/local/bundler-cache',
    '.meteor/local/plugin-cache',
    'node_modules/.cache/rspack',
    'node_modules/.cache/meteor',
  ];
  for (const target of targets) {
    const fullPath = path.join(appDir, target);
    try {
      await fs.remove(fullPath);
    } catch (err) {
      console.log(`Could not remove ${fullPath}: ${err.message}`);
    }
  }
}

/**
 * Helper function to set up a Meteor app in a temporary directory
 * Copies the app and runs npm install
 * @param {string} appName - Name of the app in the apps directory
 * @param {Object} options - Additional options
 * @param {boolean} options.isMonorepo - Whether the app is a monorepo
 * @returns {string} - Path to the temporary directory containing the app
 */
export async function setupMeteorApp(appName, options = {}) {
  const { isMonorepo = false } = options;

  // Create a unique temporary directory
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const tempDir = path.join(os.tmpdir(), `meteortest-${appName}-${randomSuffix}`);

  // Source app directory
  const sourceAppDir = path.join(__dirname, 'apps', appName);
  console.log(`Source app directory: ${sourceAppDir}`);
  console.log(`Temporary directory: ${tempDir}`);

  try {
    // Create the destination directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
    }

    // Use fs-extra's copy method with recursive option
    await fs.copy(sourceAppDir, tempDir, {
      dereference: true,
      preserveTimestamps: true,
      overwrite: true
    });
    console.log(`Copied app to temporary directory: ${tempDir}`);
  } catch (err) {
    console.error('Error during copy:', err);
  }

  if (isMonorepo) {
    // For monorepo, install dependencies at both root and app level
    console.log('Running npm install at root level...');
    await execa.command('npm install', {
      cwd: tempDir,
      stdio: 'inherit',
      shell: true,
    });

    console.log('Running npm install at app level...');
    await execa.command('npm install', {
      cwd: path.join(tempDir, 'app'),
      stdio: 'inherit',
      shell: true,
    });
  } else {
    // For regular apps, just install at the root
    console.log('Running npm install...');
    await execa.command('npm install', {
      cwd: tempDir,
      stdio: 'inherit',
      shell: true,
    });
  }

  return { tempDir };
}

/**
 * Waits for `pattern`, but fails fast (~90s) if MongoDB never starts: a hung
 * `mongod` otherwise burns the full 240s output wait silently. Skipped when an
 * external Mongo is set, since Meteor starts no local instance then.
 * @private
 */
async function waitForOutputWithMongoWatchdog(outputLines, pattern, options, meteorProcess, env) {
  const mainWait = waitForMeteorOutput(
    outputLines,
    pattern,
    { ...options, meteorProcess }
  );

  const usesExternalMongo = !!(env.MONGO_URL || process.env.MONGO_URL);
  if (options.mongoWatchdog === false || usesExternalMongo) {
    return mainWait;
  }

  const mongoTimeout = options.mongoTimeout || (process.env.CI ? 90000 : 45000);
  const mongoWait = waitForMeteorOutput(
    outputLines,
    '=> Started MongoDB.',
    { timeout: mongoTimeout, meteorProcess }
  ).catch((err) => {
    // A process exit isn't a Mongo fault; reframe only a genuine timeout.
    if (/process exited/i.test(err.message)) throw err;
    throw new Error(
      `MongoDB did not start within ${mongoTimeout}ms; likely a stale ` +
      `mongod or lock file on the (reused) CI container. (${err.message})`
    );
  });

  // Mark both handled so the race's loser can't reject unhandled later.
  mainWait.catch(() => {});
  mongoWait.catch(() => {});
  await Promise.race([mainWait, mongoWait]);
  return mainWait;
}

/**
 * Helper function to run a Meteor app
 * @param {string} tempDir - Path to the directory containing the app
 * @param {number} port - Port to run the app on
 * @param {Object} options - Additional options
 * @param {string|RegExp} options.waitForOutput - Output pattern to wait for
 * @param {Object} options.waitOptions - Options for waitForMeteorOutput
 * @param {string[]} options.commandOptions - Additional command line options for the run command (e.g. ['--production'])
 * @param {boolean} options.isMonorepo - Whether the app is a monorepo
 * @returns {Object} - The meteor process and output lines
 */
export async function runMeteorApp(tempDir, port, options = {}) {
  const { isMonorepo = false, env = {} } = options;

  // Start Meteor CLI in dev mode
  console.log(`Starting Meteor app on port ${port}...`);

  // Determine if we need to capture output
  const captureOutput = !!options.waitForOutput;

  // Combine port option with any additional command options
  const args = ['--port', port.toString()];
  if (options.commandOptions && Array.isArray(options.commandOptions)) {
    args.push(...options.commandOptions);
  }

  // For monorepo, run the meteor command from the app subdirectory
  const appDir = isMonorepo ? path.join(tempDir, 'app') : tempDir;

  // Run the meteor command
  const { meteorProcess, outputLines } = await runMeteorCommand(
    'run',
    args,
    appDir,
    {
      captureOutput,
      execaOptions: { env: { ...process.env, ...env } }
    }
  );

  // If a specific output pattern is requested, wait for it
  if (options.waitForOutput) {
    await waitForOutputWithMongoWatchdog(
      outputLines,
      options.waitForOutput,
      options,
      meteorProcess,
      env
    );
  }

  // Wait for server to be up
  if (!options.skipWaitOn) {
    console.log(`Waiting for app to be available on port ${port}...`);
    await waitOn({
      resources: [`http-get://localhost:${port}`],
      timeout: process.env.CI ? 300000 : 90000
    });
  }

  return { meteorProcess, outputLines };
}

/**
 * Resolves true if the process exits within the timeout.
 * @private
 */
function waitForProcessExit(proc, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    proc.once('exit', () => finish(true));
    // execa subprocess is also a promise; covers an exit before this listener.
    if (typeof proc.then === 'function') {
      proc.then(() => finish(true), () => finish(true));
    }
  });
}

/**
 * Kills a Meteor process. SIGTERM first so its shutdown hooks run (the rspack
 * plugin's handler releases the dev server port); SIGKILL only as a fallback.
 * @param {Object} meteorProcess - The Meteor process to kill
 * @param {Object} [options]
 * @param {number} [options.graceMs=12000] - Time to wait for a graceful exit
 * @returns {Promise<void>}
 */
export async function killMeteorProcess(meteorProcess, options = {}) {
  if (!meteorProcess) return;

  const { graceMs = 12000 } = options;

  // Already exited (signalled exits set signalCode, not exitCode).
  if (meteorProcess.exitCode != null || meteorProcess.signalCode != null) {
    return;
  }

  // Swallow the rejection a signalled exit produces on the execa promise.
  if (typeof meteorProcess.catch === 'function') {
    meteorProcess.catch(() => {});
  }

  let exitedCleanly = false;
  try {
    meteorProcess.kill('SIGTERM');
    exitedCleanly = await waitForProcessExit(meteorProcess, graceMs);
  } catch (err) {
    console.log(`Error sending SIGTERM to meteor process: ${err.message}`);
  }

  if (exitedCleanly) {
    console.log('Meteor process exited gracefully after SIGTERM');
    return;
  }

  try {
    meteorProcess.kill('SIGKILL');
    console.log('Force-killed meteor process with SIGKILL');
  } catch (err) {
    console.log(`Error killing meteor process: ${err.message}`);
  }
}

// Live Meteor processes from runMeteorCommand, so the sweep can reap one even
// when a test timed out before capturing its handle.
const activeMeteorProcesses = new Set();

/**
 * Safety net: kills anything an e2e test left running. Stops tracked Meteor
 * processes, then sweeps detached descendants (rspack dev server, mongod) by
 * the "meteortest-" temp dir in their argv. The "[-]" stops the sweep matching
 * its own command.
 * @returns {Promise<void>}
 */
export async function killStrayAppProcesses() {
  const tracked = [...activeMeteorProcesses];
  await Promise.all(
    tracked.map((proc) => killMeteorProcess(proc, { graceMs: 8000 }))
  );

  if (process.platform === 'win32') return;
  try {
    await execa.command(
      `ps -eo pid=,args= | grep -E 'meteortest[-]' | awk '{print $1}' | xargs -r kill -9`,
      { shell: true, reject: false }
    );
  } catch (err) {
    // Best-effort cleanup; never fail a test because the sweep errored.
    console.log(`Error sweeping stray app processes: ${err.message}`);
  }
}

/**
 * Kills any process running on the specified port(s)
 * @param {number|number[]} port - The port or array of ports to kill processes on
 * @returns {Promise<void>}
 */
export async function killProcessByPort(port) {
  // If port is an array, kill processes on each port
  if (Array.isArray(port)) {
    console.log(`Killing processes on multiple ports: ${port.join(', ')}...`);
    // Process each port sequentially
    for (const singlePort of port) {
      await killSingleProcessByPort(singlePort);
    }
    return;
  }

  // Handle single port case
  await killSingleProcessByPort(port);
}

/**
 * Helper function to kill a process on a single port
 * @param {number} port - The port to kill processes on
 * @returns {Promise<void>}
 * @private
 */
async function killSingleProcessByPort(port) {
  try {
    console.log(`Killing process on port ${port}...`);

    if (process.platform === 'win32') {
      const command = `FOR /F "tokens=5" %a in ('netstat -ano ^| find "LISTENING" ^| find ":${port}"') do taskkill /F /PID %a`;
      await execa.command(command, { shell: true, reject: false });
      console.log(`Successfully ensured no process is running on port ${port}`);
      return;
    }

    // Kill whatever listens on this port, retrying until the socket is verified
    // free — claiming success without checking lets an orphan survive.
    const maxAttempts = 5;
    let portFree = false;

    // Resolved once so a group kill can never signal the group Jest runs in.
    const ownGroupId = await getOwnProcessGroupId();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const pids = await findPidsOnPort(port);

      // Fast path: nothing holds the port (common in beforeEach).
      if (pids.length === 0 && await isPortFree(port)) {
        portFree = true;
        break;
      }

      for (const pid of pids) {
        // Kill the process group too, so a detached child (the rspack dev
        // server) dies with it. Skipped unless our own group is known and
        // differs, so it can't take down Jest; the PID kill alone frees the
        // socket regardless.
        const pgidResult = await execa.command(
          `ps -o pgid= -p ${pid} 2>/dev/null`,
          { shell: true, reject: false }
        );
        const pgid = (pgidResult.stdout || '').trim();
        if (/^\d+$/.test(pgid) && ownGroupId && pgid !== ownGroupId) {
          await execa.command(`kill -9 -${pgid} 2>/dev/null`, { shell: true, reject: false });
        }
        await execa.command(`kill -9 ${pid} 2>/dev/null`, { shell: true, reject: false });
      }

      // fuser fallback for when lsof/ss miss the socket owner.
      await execa.command(`fuser -k ${port}/tcp 2>/dev/null`, { shell: true, reject: false });

      // Let the OS release the socket before re-checking.
      await new Promise(r => setTimeout(r, 400));

      if (await isPortFree(port)) {
        portFree = true;
        break;
      }
    }

    if (portFree) {
      console.log(`Successfully ensured no process is running on port ${port}`);
    } else {
      console.warn(`Warning: port ${port} is still in use after ${maxAttempts} kill attempts`);
    }
  } catch (error) {
    console.error(`Error killing process on port ${port}:`, error);
  }
}

/**
 * Process group id of the test runner, read from `ps` (Node has no API) and
 * cached. Null if unknown, in which case callers must skip group kills.
 * @returns {Promise<string|null>}
 * @private
 */
let ownProcessGroupIdPromise;
function getOwnProcessGroupId() {
  if (!ownProcessGroupIdPromise) {
    ownProcessGroupIdPromise = (async () => {
      if (process.platform === 'win32') return null;
      const result = await execa.command(
        `ps -o pgid= -p ${process.pid} 2>/dev/null`,
        { shell: true, reject: false }
      );
      const pgid = (result.stdout || '').trim();
      return /^\d+$/.test(pgid) ? pgid : null;
    })();
  }
  return ownProcessGroupIdPromise;
}

/**
 * PIDs listening on a port, via lsof and ss merged (minimal images may lack
 * one). The test runner's own PID is never returned.
 * @param {number} port - The port to inspect
 * @returns {Promise<string[]>}
 * @private
 */
async function findPidsOnPort(port) {
  const pids = new Set();

  const lsof = await execa.command(
    `lsof -i :${port} -t 2>/dev/null`,
    { shell: true, reject: false }
  );
  for (const line of (lsof.stdout || '').split('\n')) {
    const pid = line.trim();
    if (/^\d+$/.test(pid)) pids.add(pid);
  }

  const ss = await execa.command(
    `ss -tlnp sport = :${port} 2>/dev/null`,
    { shell: true, reject: false }
  );
  const pidPattern = /pid=(\d+)/g;
  let match;
  while ((match = pidPattern.exec(ss.stdout || '')) !== null) {
    pids.add(match[1]);
  }

  pids.delete(String(process.pid));
  return [...pids];
}

/**
 * Resolves true if nothing is listening on the port.
 * @private
 */
async function isPortFree(port) {
  const check = await execa.command(
    `ss -tln sport = :${port} 2>/dev/null | grep -i listen | head -1`,
    { shell: true, reject: false }
  );
  return !check.stdout || check.stdout.trim() === '';
}

/**
 * Helper function to run any Meteor command
 * @param {string} command - The Meteor command to run (e.g., 'run', 'build', 'test')
 * @param {string[]} args - Additional arguments for the command
 * @param {string} cwd - Working directory where the command should be executed
 * @param {Object} options - Additional options
 * @param {Object} options.execaOptions - Additional options for execa
 * @param {boolean} options.captureOutput - Whether to capture the command's output
 * @param {boolean} options.checkExitCode - Whether to automatically check the exit code and throw an error if it's not 0
 * @returns {Object} - The meteor process and output lines if capturing output, and processResult if checkExitCode is true
 */
export async function runMeteorCommand(command, args = [], cwd, options = {}) {
  console.log(`Running Meteor command: ${command} ${args.join(' ')}...`);

  const { captureOutput = false, checkExitCode = false, execaOptions: extraExecaOptions = {}, env = {} } = options;

  const execaOptions = {
    cwd,
    env: {
      ...process.env,
      ...env
    },
    ...extraExecaOptions
  };

  // If we're capturing output, set up stdio accordingly
  if (captureOutput) {
    execaOptions.stdio = ['inherit', 'pipe', 'pipe'];
  } else {
    execaOptions.stdio = 'inherit';
  }

  const meteorProcess = execa(METEOR_EXECUTABLE, [command, ...args], execaOptions);

  // Track so the sweep can reap it if a test times out before grabbing it.
  activeMeteorProcesses.add(meteorProcess);
  meteorProcess.once('exit', () => activeMeteorProcesses.delete(meteorProcess));

  // If we're capturing output, set up the output collection
  let outputLines = [];
  if (captureOutput && meteorProcess.stdout && meteorProcess.stderr) {
    meteorProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      outputLines.push(...lines);
      // Still log to console for visibility
      process.stdout.write(data);
    });

    meteorProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      outputLines.push(...lines);
      // Still log to console for visibility
      process.stderr.write(data);
    });
  }

  // If we're checking the exit code, wait for the process to complete and check it
  let processResult;
  if (checkExitCode) {
    processResult = await new Promise((resolve) => {
      meteorProcess.on('exit', (code) => {
        resolve({ code, outputLines });
      });
    });

    // Check if the command was successful
    if (processResult.code !== 0) {
      throw new Error(`Meteor command '${command}' failed with code ${processResult.code}${captureOutput ? `:\n${processResult.outputLines.join('\n')}` : ''}`);
    }
  }

  return { meteorProcess, outputLines, processResult };
}

/**
 * Helper function to create a new Meteor app with a specific example
 * @param {string} appName - Name of the new app
 * @param {string} example - Example to use (e.g., 'react', 'vue')
 * @param {Object} options - Additional options for execa
 * @returns {Object} - The path to the new app, the meteor process, and the process result
 */
export async function createMeteorApp(appName, example, options = {}) {
  // Create a unique temporary directory that will be the app directory directly
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const tempAppName= `meteortest-${appName}-${randomSuffix}`;
  const tempDir = path.join(os.tmpdir(), tempAppName);

  console.log(`Creating new Meteor app '${appName}' with example '${example}' in ${tempDir}...`);

  // Create the destination directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    await fs.mkdir(tempDir, { recursive: true });
  }

  // Run 'meteor create --react myapp' command
  const args = ['create'];

  // Add example option if provided
  if (example) {
    args.push(`--${example}`);
  }

  // Add app name
  args.push(tempAppName);

  // Run the command in the temporary directory
  const { meteorProcess, processResult } = await runMeteorCommand(args[0], args.slice(1), os.tmpdir(), {
    execaOptions: options,
    checkExitCode: true
  });

  return { tempDir, meteorProcess, processResult };
}

/**
 * Helper function to clean up a temporary directory
 * @param {string} tempDir - Path to the temporary directory to clean up
 * @returns {Promise<void>}
 */
export async function cleanupTempDir(tempDir) {
  if (tempDir) {
    try {
      rimraf.sync(tempDir, { disableGlob: true, maxRetries: 5, retryDelay: 500 });
      console.log(`Removed temporary directory: ${tempDir}`);
    } catch (err) {
      // Implement async removal as a fallback
      return new Promise((resolve, reject) => {
        rimraf(tempDir, { disableGlob: true, maxRetries: 5, retryDelay: 500 }, (error) => {
          if (error) {
            console.error(`Async removal also failed: ${error}`);
            reject(error);
          } else {
            console.log(`Removed temporary directory: ${tempDir}`);
            resolve();
          }
        });
      });
    }
  }
}

/**
 * Helper function to wait for a specific number of milliseconds
 * @param {number} ms - The number of milliseconds to wait
 * @returns {Promise<void>} - A promise that resolves after the specified time
 */
export async function wait(ms) {
  console.log(`Waiting for ${ms} milliseconds...`);
  return new Promise(resolve => {
    setTimeout(() => {
      console.log(`Finished waiting for ${ms} milliseconds`);
      resolve();
    }, ms);
  });
}

/**
 * Helper function to wait for specific output from a Meteor process
 * @param {string[]} outputLines - Array that will be populated with output lines
 * @param {string|RegExp} pattern - String or RegExp pattern to wait for
 * @param {Object} options - Options for waiting
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @param {boolean} options.negate - If true, wait until the pattern is NOT found in any output line
 * @returns {Promise<string>} - A promise that resolves with the matched line
 */
export async function waitForMeteorOutput(outputLines, pattern, options = {}) {
  const timeout = options.timeout || (process.env.CI ? 240000 : 90000); // Default 90s locally, 240s on CI
  const checkInterval = options.checkInterval || 100; // Check every 100ms by default
  const negate = options.negate || false; // Default is to check for presence, not absence
  const meteorProcess = options.meteorProcess || null;

  console.log(`Waiting for output ${negate ? 'NOT ' : ''}matching: ${pattern}`);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let processExited = false;
    let processExitCode = null;

    // If we have access to the meteor process, watch for unexpected exits
    if (meteorProcess) {
      meteorProcess.on('exit', (code) => {
        processExited = true;
        processExitCode = code;
      });
    }

    const lineMatches = (line) =>
      (typeof pattern === 'string' && line.includes(pattern)) ||
      (pattern instanceof RegExp && pattern.test(line));

    // Function to check for the pattern in the output lines
    const checkForPattern = () => {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeout) {
        // In negate mode the wait can only fail because some line matched.
        // Surface those lines so the failure is diagnosable instead of a
        // bare timeout.
        let detail = '';
        if (negate) {
          const offending = outputLines.filter(lineMatches);
          detail = `\nOffending line(s):\n${offending.slice(-20).join('\n')}`;
        }
        reject(new Error(
          `Timeout waiting for output ${negate ? 'NOT ' : ''}matching: ${pattern}${detail}`
        ));
        return;
      }

      if (negate) {
        // In negation mode, we need to check all lines and make sure none match
        // If we've processed all lines and none match, we can resolve
        if (outputLines.length > 0) {
          if (!outputLines.some(lineMatches)) {
            console.log(`Confirmed no output matching: ${pattern}`);
            resolve(null);
            return;
          }
        }
      } else {
        // Check each line for the pattern (original behavior)
        for (const line of outputLines) {
          if (typeof pattern === 'string' && line.includes(pattern)) {
            console.log(`Found output matching string: ${pattern}`);
            resolve(line);
            return;
          } else if (pattern instanceof RegExp && pattern.test(line)) {
            console.log(`Found output matching regex: ${pattern}`);
            resolve(line);
            return;
          }
        }
      }

      // Fail fast if the meteor process exited before we found the expected output.
      // Checked after pattern matching so we don't miss output that arrived before the exit event.
      if (processExited && !negate) {
        reject(new Error(
          `Meteor process exited with code ${processExitCode} before output matching: ${pattern}\n` +
          `Last output:\n${outputLines.slice(-20).join('\n')}`
        ));
        return;
      }

      // If we didn't find a match, check again after the interval
      setTimeout(checkForPattern, checkInterval);
    };

    // Start checking
    checkForPattern();
  });
}

/**
 * Helper function to replace specific text within a file in a temporary directory
 * This is useful for triggering file change detection in tests
 * @param {string} tempDir - Path to the temporary directory
 * @param {string} filePath - Path to the file relative to tempDir
 * @param {Object} options - Additional options
 * @param {string} options.searchText - Text to search for in the file
 * @param {string} options.replaceText - Text to replace the searchText with
 * @param {boolean} options.createIfNotExists - Create the file if it doesn't exist (default: true)
 * @returns {Promise<void>} - A promise that resolves when the file has been updated
 */
export async function replaceFileContent(tempDir, filePath, options = {}) {
  const { searchText, replaceText, createIfNotExists = true } = options;
  const fullPath = path.join(tempDir, filePath);

  console.log(`Replacing text in file: ${fullPath}`);

  try {
    // Check if file exists
    const fileExists = await fs.pathExists(fullPath);

    if (!fileExists) {
      if (!createIfNotExists) {
        throw new Error(`File does not exist: ${fullPath}`);
      }
      // Create directory structure if it doesn't exist
      await fs.ensureDir(path.dirname(fullPath));
      // Create an empty file
      await fs.writeFile(fullPath, '', 'utf8');
    } else {
      // Read the existing content
      const content = await fs.readFile(fullPath, 'utf8');

      // Replace the specified text
      const newContent = content.replace(searchText, replaceText);

      // Write the modified content back to the file
      await fs.writeFile(fullPath, newContent, 'utf8');
    }

    console.log(`Successfully replaced text in file: ${fullPath}`);
  } catch (err) {
    console.error(`Error replacing text in file ${fullPath}:`, err);
    throw err;
  }
}

/**
 * Helper function to append content to a file in a temporary directory
 * This is useful for adding code to files during tests
 * @param {string} tempDir - Path to the temporary directory
 * @param {string} filePath - Path to the file relative to tempDir
 * @param {string} content - Content to append to the file
 * @param {Object} options - Additional options
 * @param {boolean} options.createIfNotExists - Create the file if it doesn't exist (default: true)
 * @param {string} options.separator - Separator to add before the appended content (default: '\n')
 * @returns {Promise<void>} - A promise that resolves when the file has been updated
 */
export async function appendFileContent(tempDir, filePath, options = {}) {
  const { createIfNotExists = true, separator = '\n', content = '' } = options;
  const fullPath = path.join(tempDir, filePath);

  console.log(`Appending content to file: ${fullPath}`);

  try {
    // Check if file exists
    const fileExists = await fs.pathExists(fullPath);

    if (!fileExists) {
      if (!createIfNotExists) {
        throw new Error(`File does not exist: ${fullPath}`);
      }
      // Create directory structure if it doesn't exist
      await fs.ensureDir(path.dirname(fullPath));
      // Create the file with the content
      await fs.writeFile(fullPath, content, 'utf8');
    } else {
      // Read the existing content
      const existingContent = await fs.readFile(fullPath, 'utf8');

      // Append the new content with a separator
      const newContent = existingContent + separator + content;

      // Write the modified content back to the file
      await fs.writeFile(fullPath, newContent, 'utf8');
    }

    console.log(`Successfully appended content to file: ${fullPath}`);
  } catch (err) {
    console.error(`Error appending content to file ${fullPath}:`, err);
    throw err;
  }
}

/**
 * Helper function to run Meteor tests with the meteortesting:mocha driver package
 * @param {string} tempDir - Path to the directory containing the app
 * @param {number} port - Port to run the tests on
 * @param {Object} options - Additional options
 * @param {string|RegExp} options.waitForOutput - Output pattern to wait for
 * @param {Object} options.waitOptions - Options for waitForMeteorOutput
 * @param {string[]} options.commandOptions - Additional command line options for the test command
 * @param {boolean} options.testClient - Whether to enable client-side tests with a browser driver
 * @param {boolean} options.checkTestResults - Whether to check test results and propagate failures to Jest
 * @param {boolean} options.isMonorepo - Whether the app is a monorepo
 * @returns {Object} - The meteor process and output lines
 */
export async function runMeteorTests(tempDir, port, options = {}) {
  const { isMonorepo = false, env = {} } = options;

  // Start Meteor tests
  console.log(`Starting Meteor tests on port ${port}...`);

  // Determine if we need to capture output
  const captureOutput = !!options.waitForOutput || !!options.checkTestResults;

  // Combine base options with any additional command options
  const args = ['--port', port.toString(), '--driver-package', 'meteortesting:mocha'];
  if (options.commandOptions && Array.isArray(options.commandOptions)) {
    args.push(...options.commandOptions);
  }

  // For monorepo, run the meteor command from the app subdirectory
  const appDir = isMonorepo ? path.join(tempDir, 'app') : tempDir;

  // Run the meteor test command
  const { meteorProcess, outputLines, processResult } = await runMeteorCommand(
    'test',
    args,
    appDir,
    {
      execaOptions: {
        env: {
          ...process.env,
          ...(options.testClient ? { TEST_BROWSER_DRIVER: 'playwright' } : { TEST_CLIENT: 0 }),
          ...env,
        }
      },
      captureOutput,
      checkExitCode: options.checkTestResults // Automatically check exit code if checkTestResults is true
    }
  );

  // If a specific output pattern is requested, wait for it
  if (options.waitForOutput) {
    await waitForOutputWithMongoWatchdog(
      outputLines,
      options.waitForOutput,
      options,
      meteorProcess,
      env
    );
  }

  return { meteorProcess, outputLines, processResult };
}

/**
 * Helper function to wait for a console message matching a pattern
 * @param {string|RegExp} pattern - Pattern to match in console messages
 * @param {Object} options - Additional options
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.checkInterval - Interval between checks in milliseconds
 * @param {boolean} options.negate - If true, wait until the pattern is NOT found in any console message
 * @param {boolean} options.returnAllLogs - If true, returns an object with both the matching message and all collected logs
 * @param {boolean} options.collectAllLogs - If true, collects all logs for the specified timeout period without waiting for a pattern match
 * @returns {Promise<string|{message: string, allLogs: string[]}>} - Returns the matching message or an object with message and allLogs if returnAllLogs is true
 */
export async function waitForPlaywrightConsole(pattern, options = {}) {
  const timeout = options.timeout || (process.env.CI ? 90000 : 30000); // Default 30s locally, 90s on CI
  const checkInterval = options.checkInterval || 100; // Check every 100ms by default
  const negate = options.negate || false; // Default is to check for presence, not absence
  const returnAllLogs = options.returnAllLogs || false; // Default is to return just the matching message
  const collectAllLogs = options.collectAllLogs || false; // Default is to wait for a pattern match

  if (collectAllLogs) {
    console.log(`Collecting all console logs for ${timeout}ms`);
  } else {
    console.log(`Waiting for console message ${negate ? 'NOT ' : ''}matching: ${pattern}`);
  }

  // Array to collect console messages
  const consoleMessages = [];

  // Create a named listener function so we can remove it later
  const consoleListener = (msg) => {
    const text = msg.text();
    consoleMessages.push(text);
    console.log(`Browser console: ${text}`);
  };

  // Set up console message listener
  page.on('console', consoleListener);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // If we're just collecting all logs, set a timeout to resolve after the specified time
    if (collectAllLogs) {
      setTimeout(() => {
        console.log(`Collected ${consoleMessages.length} console logs in ${timeout}ms`);
        page.removeListener('console', consoleListener);
        resolve({ message: null, allLogs: [...consoleMessages] });
      }, timeout);
      return;
    }

    // Function to check for the pattern in the console messages
    const checkForPattern = () => {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeout) {
        // Remove the listener before rejecting
        page.removeListener('console', consoleListener);
        reject(new Error(`Timeout waiting for console message ${negate ? 'NOT ' : ''}matching: ${pattern}`));
        return;
      }

      if (negate) {
        // In negation mode, we need to check all messages and make sure none match
        // If we've received messages and none match, we can resolve
        if (consoleMessages.length > 0) {
          let allMessagesPass = true;
          for (const message of consoleMessages) {
            const matches = (typeof pattern === 'string' && message.includes(pattern)) || 
                           (pattern instanceof RegExp && pattern.test(message));
            if (matches) {
              allMessagesPass = false;
              break;
            }
          }
          if (allMessagesPass) {
            console.log(`Confirmed no console message matching: ${pattern}`);
            // Remove the listener before resolving
            page.removeListener('console', consoleListener);
            if (returnAllLogs) {
              resolve({ message: null, allLogs: [...consoleMessages] });
            } else {
              resolve(null);
            }
            return;
          }
        }
      } else {
        // Check each message for the pattern (original behavior)
        for (const message of consoleMessages) {
          if (typeof pattern === 'string' && message.includes(pattern)) {
            console.log(`Found console message matching string: ${pattern}`);
            // Remove the listener before resolving
            page.removeListener('console', consoleListener);
            if (returnAllLogs) {
              resolve({ message, allLogs: [...consoleMessages] });
            } else {
              resolve(message);
            }
            return;
          } else if (pattern instanceof RegExp && pattern.test(message)) {
            console.log(`Found console message matching regex: ${pattern}`);
            // Remove the listener before resolving
            page.removeListener('console', consoleListener);
            if (returnAllLogs) {
              resolve({ message, allLogs: [...consoleMessages] });
            } else {
              resolve(message);
            }
            return;
          }
        }
      }

      // If we didn't find a match, check again after the interval
      setTimeout(checkForPattern, checkInterval);
    };

    // Start checking
    checkForPattern();
  });
}

/**
 * Helper function to build a Meteor app using 'meteor build'
 * @param {string} tempDir - Path to the directory containing the app
 * @param {Object} options - Additional options
 * @param {string[]} options.commandOptions - Additional command line options for the build command
 * @param {boolean} options.captureOutput - Whether to capture the command's output
 * @param {boolean} options.isMonorepo - Whether the app is a monorepo
 * @returns {Object} - The build output directory and the meteor process result
 */
export async function buildMeteorApp(tempDir, options = {}) {
  const { isMonorepo = false, env = {} } = options;

  // Create a unique temporary directory for the build output
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const buildOutputDir = path.join(os.tmpdir(), `meteor-build-${randomSuffix}`);

  console.log(`Building Meteor app from ${tempDir} to ${buildOutputDir}...`);

  // Create the build output directory if it doesn't exist
  if (!fs.existsSync(buildOutputDir)) {
    await fs.mkdir(buildOutputDir, { recursive: true });
  }

  // Combine base options with any additional command options
  const args = [buildOutputDir];
  if (options.commandOptions && Array.isArray(options.commandOptions)) {
    args.push(...options.commandOptions);
  }

  // For monorepo, run the meteor command from the app subdirectory
  const appDir = isMonorepo ? path.join(tempDir, 'app') : tempDir;

  // Run the meteor build command with automatic exit code checking
  const result = await runMeteorCommand(
    'build',
    args,
    appDir,
    {
      execaOptions: { ...(options.execaOptions || {}), env: { ...process.env, ...(options.execaOptions?.env || {}), ...env } },
      captureOutput: options.captureOutput !== undefined ? options.captureOutput : true,
      checkExitCode: true // Automatically check exit code
    }
  );

  console.log(`Successfully built Meteor app to ${buildOutputDir}`);

  return { buildOutputDir, processResult: result.processResult };
}
