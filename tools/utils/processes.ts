import child_process from 'child_process';
import { Writable } from 'stream';
import { convertToOSPath } from '../static-assets/server/mini-files';

// The execFileSync function is meant to resemble the similarly-named Node 0.12
// synchronous process creation API, but instead of being fully blocking it
// uses a promise-based implementation. You can also use
// execFileAsync directly, which returns a promise.
// Some functionality is currently missing but could be added when the need
// arises (e.g. support for timeout, maxBuffer, and encoding options).
// Eventually, these versions should replace the ones in tools/utils/utils.js
// and tools/tool-testing/selftest.js.

type ExecFileOptions = {
  /**
   * Current working directory of the child process
   */
  cwd?: string,

  /**
   * Environment key-value pairs
   */
  env?: NodeJS.ProcessEnv,

  /**
   * Child's stdio configuration.
   * (Default: 'pipe') Specifying anything but 'pipe' will disallow capture.
   */
  stdio?: 'pipe' | Array<null | undefined | 'pipe'>,

  /**
   * If specified, instead of capturing the output, the child process stdout
   * will be piped to the destination stream.
   */
  destination?: Writable,

  /**
   * Whether to wait for the child process streams to close or to resolve
   * the promise when the child process exits.
   */
  waitForClose?: boolean,
}

 /**
  * @deprecated
  * @summary Executes a command synchronously, returning either the captured
  * stdout output or throwing an error containing the stderr output as part of
  * the message. In addition, the error will contain fields pid, stderr, stdout,
  * status and signal.
  * @param command The command to run
  * @param args List of string arguments
  * @param options
  * @returns The stdout from the command
  */
export function execFileSync(
  command: string,
  args?: ReadonlyArray<string> | ExecFileOptions,
  options?: ExecFileOptions
) {
  return execFileAsync(command, args, options);
}

 /**
  * @summary Executes a command asynchronously, returning a promise that will
  * either be resolved to the captured stdout output or be rejected with an
  * error containing the stderr output as part of the message. In addition,
  * the error will contain fields pid, stderr, stdout, status and signal.
  * @param command The command to run
  * @param args List of string arguments
  * @param options
  */
export function execFileAsync(
  command: string,
  args?: ReadonlyArray<string> | ExecFileOptions,
  options: ExecFileOptions = { waitForClose: true }
) {
  // args is optional, so if it's not an array we interpret it as options
  if (!Array.isArray(args)) {
    options = {
      ...options,
      ...args,
    }
  }

  if (options.cwd) {
    options.cwd = convertToOSPath(options.cwd);
  }

  // The child process close event is emitted when the stdio streams
  // have all terminated. If those streams are shared with other
  // processes, that means we won't receive a 'close' until all processes
  // have exited, so we may want to respond to 'exit' instead.
  // (The downside of responding to 'exit' is that the streams may not be
  // fully flushed, so we could miss captured output. Only use this
  // option when needed.)
  const exitEvent = options.waitForClose ? 'close' : 'exit';

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof child_process.exec>;
    const spawnArgs: ReadonlyArray<string> = Array.isArray(args) ? args : [];
    const { cwd, env, stdio } = options;

    if (process.platform !== 'win32') {
      child = child_process.spawn(command, spawnArgs, { cwd, env, stdio });
    } else {
      // https://github.com/nodejs/node-v0.x-archive/issues/2318
      spawnArgs.forEach(arg => {
        command += ' ' + arg;
      });
      child = child_process.spawn(command, { cwd, env, shell: true });
    }

    let capturedStdout = '';
    if (child.stdout) {
      if (options.destination) {
        child.stdout.pipe(options.destination);
      } else {
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (data: string) => {
          capturedStdout += data;
        });
      }
    }

    let capturedStderr = '';
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (data: string) => {
        capturedStderr += data;
      });
    }

    const errorCallback = (error: NodeJS.ErrnoException) => {
      // Make sure we only receive one type of callback
      child.removeListener(exitEvent, exitCallback);

      // Trim captured output to get rid of excess whitespace
      capturedStdout = capturedStdout.trim();
      capturedStderr = capturedStderr.trim();

      Object.assign(error, {
        pid: child.pid,
        stdout: capturedStdout,
        stderr: capturedStderr,
      });

      // Set a more informative error message on ENOENT, that includes the
      // command we attempted to execute
      if (error.code === 'ENOENT') {
        error.message = `Could not find command '${command}'`;
      }

      reject(error);
    };
    child.on('error', errorCallback);

    const exitCallback = (code: number, signal: string) => {
      // Make sure we only receive one type of callback
      child.removeListener('error', errorCallback);

      // Trim captured output to get rid of excess whitespace
      capturedStdout = capturedStdout.trim();
      capturedStderr = capturedStderr.trim();

      if (code === 0) {
        resolve(capturedStdout);
      } else {
        let errorMessage = `Command failed: ${command}`;
        if (spawnArgs) {
          errorMessage += ` ${spawnArgs.join(' ')}`;
        }
        errorMessage += `\n${capturedStderr}`;

        const error = new Error(errorMessage);

        Object.assign(error, {
          pid: child.pid,
          stdout: capturedStdout,
          stderr: capturedStderr,
          status: code,
          signal: signal
        })

        reject(error);
      }
    };
    child.on(exitEvent, exitCallback);
  });
}
