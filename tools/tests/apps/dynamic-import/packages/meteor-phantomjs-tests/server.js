const phantomjs = Npm.require('phantomjs-prebuilt');
const childProcess = Npm.require('child_process');

const PHANTOMJS_SCRIPT_FILE_NAME = 'phantomjsScript.js';

export function startPhantom({
  stdout,
  stderr,
  done,
}) {
  const scriptPath = Assets.absoluteFilePath(PHANTOMJS_SCRIPT_FILE_NAME);

  if (process.env.METEOR_PHANTOMJS_DEBUG) {
    console.log('PhantomJS Path:', phantomjs.path);
    console.log('PhantomJS Script Path:', scriptPath);
  }

  const args = [];
  const keyPrefix = "METEOR_PHANTOMJS_";
  Object.keys(process.env).forEach(key => {
    if (key.startsWith(keyPrefix)) {
      console.log(keyPrefix);
      args.push(
        "--" + key
          .slice(keyPrefix.length)
          .toLowerCase()
          .replace(/_/g, "-"),
        process.env[key]
      );
    }
  });

  args.push(scriptPath);

  const phantomProcess = childProcess.execFile(phantomjs.path, args, {
    env: {
      ROOT_URL: process.env.ROOT_URL,
    },
  });

  phantomProcess.on('error', (error) => {
    throw error;
  });

  phantomProcess.on('exit', done);

  // The PhantomJS script echoes whatever the page prints to the browser console and
  // here we echo that once again.
  phantomProcess.stdout.on('data', stdout);
  phantomProcess.stderr.on('data', stderr);
}
