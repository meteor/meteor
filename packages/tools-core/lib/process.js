const { spawn } = require('child_process');
const net = require('net');
const { logError } = require('./log');

/**
 * Spawns a new OS process with the given command and arguments.
 * Streams output with original styling and handles errors and exit events.
 * Always preserves raw output formatting (colors, progress bars, etc.) and
 * provides decoded string data to callbacks for logic/checking/logging.
 * 
 * @param {string} command - The command to run
 * @param {string[]} args - Arguments to pass to the command
 * @param {Object} options - Options for the spawned process
 * @param {Object} [options.env] - Environment variables to merge with process.env
 * @param {string} [options.cwd] - Current working directory
 * @param {boolean} [options.detached] - Whether to run the process detached from the parent
 * @param {Function} [options.onStdout] - Callback for stdout data (receives decoded string)
 * @param {Function} [options.onStderr] - Callback for stderr data (receives decoded string)
 * @param {Function} [options.onExit] - Callback when process exits
 * @param {Function} [options.onError] - Callback when process encounters an error
 * @returns {Object} The spawned process with additional utility methods
 */
export function spawnProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    env: { ...process.env, ...(options.env || {}), FORCE_COLOR: '1', TERM: 'xterm-256color' },
    cwd: options.cwd || process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: options.detached || false,
    ...(process.platform === 'win32' && { shell: true }),
  });

  // Add a reference to track if the process is running
  proc.isRunning = true;

  // Handle stdout
  proc.stdout.on('data', (buf) => {
    if (options.onStdout) {
      options.onStdout(buf.toString());
    }
  });

  // Handle stderr
  proc.stderr.on('data', (buf) => {
    if (options.onStderr) {
      options.onStderr(buf.toString());
    }
  });

  // Handle process exit
  proc.on('close', (code, signal) => {
    proc.isRunning = false;
    if (options.onExit) options.onExit(code, signal);
  });

  // Handle process errors
  proc.on('error', (err) => {
    proc.isRunning = false;
    if (options.onError) options.onError(err);
    else logError(`=> Process error: ${err.message}`);
  });

  // This happens sometimes when we write to stdin after the app
  // is dead. If we don't register a handler, we get a top level
  // exception and the whole app dies.
  proc.stdin.on('error', () => {});

  if (options.detached) proc.unref();
  return proc;
}

/**
 * Stops a running process.
 * 
 * @param {Object} proc - The process to stop
 * @param {Object} [options] - Options for stopping the process
 * @param {string} [options.signal='SIGTERM'] - The signal to send to the process
 * @param {number} [options.timeout=5000] - Timeout in ms before forcing kill with SIGKILL
 * @returns {Promise<void>} A promise that resolves when the process is stopped
 */
export function stopProcess(proc, options = {}) {
  if (!proc || !proc.pid || !isProcessRunning(proc)) {
    return Promise.resolve();
  }

  const signal = options.signal || 'SIGTERM';
  const timeout = options.timeout || 5000;

  return new Promise((resolve) => {
    // Set a timeout to force kill if the process doesn't exit gracefully
    const forceKillTimeout = setTimeout(() => {
      if (isProcessRunning(proc)) {
        proc.kill('SIGKILL');
      }
    }, timeout);

    // Listen for the process to exit
    proc.on('close', () => {
      clearTimeout(forceKillTimeout);
      proc.isRunning = false;
      resolve();
    });

    // Send the signal to terminate the process
    proc.kill(signal);
  });
}

/**
 * Checks if a process is running.
 * 
 * @param {Object} proc - The process to check
 * @returns {boolean} True if the process is running, false otherwise
 */
export function isProcessRunning(proc) {
  if (!proc || !proc.pid) {
    return false;
  }

  // If we've been tracking the process state with our isRunning property
  if (proc.isRunning === false) {
    return false;
  }

  // Try to send signal 0 to the process, which doesn't actually send a signal
  // but checks if the process exists
  try {
    process.kill(proc.pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Checks if a port is available.
 * 
 * @param {number} port - The port to check
 * @param {string} [host='127.0.0.1'] - The host to check
 * @returns {Promise<boolean>} A promise that resolves to true if the port is available, false otherwise
 */
export function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // For other errors, we'll assume the port is not available
        resolve(false);
      }
    });

    server.once('listening', () => {
      // Close the server and resolve with true (port is available)
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, host);
  });
}

/**
 * Waits for a port to become available or unavailable.
 * 
 * @param {number} port - The port to check
 * @param {Object} [options] - Options for waiting
 * @param {string} [options.host='127.0.0.1'] - The host to check
 * @param {boolean} [options.waitUntilAvailable=false] - If true, wait until port is available; if false, wait until port is in use
 * @param {number} [options.timeout=30000] - Timeout in ms
 * @param {number} [options.interval=500] - Interval between checks in ms
 * @returns {Promise<boolean>} A promise that resolves to true if the condition is met, false if timed out
 */
export function waitForPort(port, options = {}) {
  const host = options.host || '127.0.0.1';
  const waitUntilAvailable = options.waitUntilAvailable || false;
  const timeout = options.timeout || 30000;
  const interval = options.interval || 500;

  const startTime = Date.now();

  return new Promise((resolve) => {
    let timeoutId = null;

    const check = async () => {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeout) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(false);
        return;
      }

      const isAvailable = await isPortAvailable(port, host);

      // If we're waiting for the port to be available and it is, or
      // if we're waiting for the port to be in use and it's not available
      if ((waitUntilAvailable && isAvailable) || (!waitUntilAvailable && !isAvailable)) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        resolve(true);
        return;
      }

      // Schedule the next check
      timeoutId = setTimeout(check, interval);
    };

    // Start checking
    check();
  });
}
