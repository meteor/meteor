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
  const { isMonorepo = false } = options;

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
      captureOutput
    }
  );

  // If a specific output pattern is requested, wait for it
  if (options.waitForOutput) {
    await waitForMeteorOutput(
      outputLines,
      options.waitForOutput,
      options
    );
  }

  // Wait for server to be up
  console.log(`Waiting for app to be available on port ${port}...`);
  await waitOn({
    resources: [`http-get://localhost:${port}`],
    timeout: 90000
  });

  return { meteorProcess, outputLines };
}

/**
 * Helper function to kill a Meteor process
 * @param {Object} meteorProcess - The Meteor process to kill
 * @returns {Promise<void>}
 */
export async function killMeteorProcess(meteorProcess) {
  if (meteorProcess) {
    try {
      await meteorProcess.kill('SIGKILL');
      console.log('Successfully killed meteor process');
    } catch (err) {
      console.log(`Error killing meteor process: ${err.message}`);
    }
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
    // Different commands based on OS
    const command = process.platform === 'win32'
      ? `FOR /F "tokens=5" %a in ('netstat -ano ^| find "LISTENING" ^| find ":${port}"') do taskkill /F /PID %a`
      : `lsof -i :${port} -t | xargs -r kill -9`;

    console.log(`Killing process on port ${port}...`);
    try {
      // Use { reject: false } to prevent execa from throwing on non-zero exit codes
      const result = await execa.command(command, { shell: true, reject: false });
      if (result.failed) {
        // It's okay if this fails because there might not be a process on that port
        console.log(`No process found on port ${port} or command returned non-zero exit code`);
      } else {
        console.log(`Successfully killed process on port ${port}`);
      }
    } catch (err) {
      // This catch block will only be reached for operational errors, not for command failures
      console.log(`Error executing kill command: ${err.message}`);
    }
    console.log(`Successfully ensured no process is running on port ${port}`);
  } catch (error) {
    // This should never be reached with the inner try/catch, but keeping as a safety net
    console.error(`Error killing process on port ${port}:`, error);
  }
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

  const { captureOutput = false, checkExitCode = false, execaOptions: extraExecaOptions = {} } = options;

  const execaOptions = {
    cwd,
    ...extraExecaOptions
  };

  // If we're capturing output, set up stdio accordingly
  if (captureOutput) {
    execaOptions.stdio = ['inherit', 'pipe', 'pipe'];
  } else {
    execaOptions.stdio = 'inherit';
  }

  const meteorProcess = execa(METEOR_EXECUTABLE, [command, ...args], execaOptions);

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
  const timeout = options.timeout || 90000; // Default 1 minute timeout
  const checkInterval = options.checkInterval || 100; // Check every 100ms by default
  const negate = options.negate || false; // Default is to check for presence, not absence

  console.log(`Waiting for output ${negate ? 'NOT ' : ''}matching: ${pattern}`);

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Function to check for the pattern in the output lines
    const checkForPattern = () => {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for output ${negate ? 'NOT ' : ''}matching: ${pattern}`));
        return;
      }

      if (negate) {
        // In negation mode, we need to check all lines and make sure none match
        // If we've processed all lines and none match, we can resolve
        if (outputLines.length > 0) {
          let allLinesPass = true;
          for (const line of outputLines) {
            const matches = (typeof pattern === 'string' && line.includes(pattern)) || 
                           (pattern instanceof RegExp && pattern.test(line));
            if (matches) {
              allLinesPass = false;
              break;
            }
          }
          if (allLinesPass) {
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
 * @param {boolean} options.checkTestResults - Whether to check test results and propagate failures to Jest
 * @param {boolean} options.isMonorepo - Whether the app is a monorepo
 * @returns {Object} - The meteor process and output lines
 */
export async function runMeteorTests(tempDir, port, options = {}) {
  const { isMonorepo = false } = options;

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
          TEST_BROWSER_DRIVER: 'playwright'
        }
      },
      captureOutput,
      checkExitCode: options.checkTestResults // Automatically check exit code if checkTestResults is true
    }
  );

  // If a specific output pattern is requested, wait for it
  if (options.waitForOutput) {
    await waitForMeteorOutput(
      outputLines,
      options.waitForOutput,
      options
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
  const timeout = options.timeout || 30000; // Default 30 seconds timeout
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
  const { isMonorepo = false } = options;

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
      execaOptions: options.execaOptions || {},
      captureOutput: options.captureOutput !== undefined ? options.captureOutput : true,
      checkExitCode: true // Automatically check exit code
    }
  );

  console.log(`Successfully built Meteor app to ${buildOutputDir}`);

  return { buildOutputDir, processResult: result.processResult };
}
