import _ from 'underscore';
import files from '../fs/files.js';
import { Console } from '../console.js';
import { execFileAsync, execFileSync } from '../utils/utils.js';

export function execFileAsyncOrThrow(file, args, opts, cb) {
  Console.debug('Running asynchronously: ', file, args);

  if (_.isFunction(opts)) {
    cb = opts;
    opts = undefined;
  }

  var p = execFileAsync(file, args, opts);
  p.on('close', function (code) {
    var err = null;
    if (code)
      err = new Error(file + ' ' + args.join(' ') +
                      ' exited with non-zero code: ' + code + '. Use -v for' +
                      ' more logs.');

    if (cb) cb(err, code);
    else if (err) throw err;
  });
};

export function execFileSyncOrThrow(file, args, opts) {
  Console.debug('Running synchronously: ', file, args);

  var childProcess = execFileSync(file, args, opts);
  if (!childProcess.success) {
    // XXX Include args
    var message = 'Error running ' + file;
    if (childProcess.stderr) {
      message = message + "\n" + childProcess.stderr + "\n";
    }
    if (childProcess.stdout) {
      message = message + "\n" + childProcess.stdout + "\n";
    }

    throw new Error(message);
  }

  return childProcess;
};
