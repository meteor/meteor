import { execFile } from 'child_process';
import Client from '../client.js';
import { enterJob } from '../../utils/buildmessage.js';
import { ensureDependencies } from '../../cli/dev-bundle-helpers.js';
import {
  convertToOSPath,
  pathJoin,
  getCurrentToolsDir,
} from '../../fs/files.js';

const NPM_DEPENDENCIES = {
  'phantomjs-prebuilt': '2.1.14',
};

// PhantomClient
export default class PhantomClient extends Client {
  constructor(options) {
    super(options);

    enterJob({
      title: 'Installing PhantomJS in Meteor tool',
    }, () => {
      ensureDependencies(NPM_DEPENDENCIES);
    });

    this.npmPackageExports = require("phantomjs-prebuilt");

    this.name = "phantomjs";
    this.process = null;

    this._logError = true;
  }

  connect() {
    const phantomPath = this.npmPackageExports.path;
    const scriptPath = pathJoin(getCurrentToolsDir(), "tools",
      "tool-testing", "phantom", "open-url.js");
    this.process = execFile(
      phantomPath,
      [
        "--load-images=no",
        convertToOSPath(scriptPath), this.url
      ],
      {},
      (error, stdout, stderr) => {
        if (this._logError && error) {
          console.log(
            "PhantomJS exited with error ", error,
            "\nstdout:\n", stdout,
            "\nstderr:\n", stderr
          );
        } else if (stderr) {
          console.log("PhantomJS stderr:\n", stderr);
        }
      }
    );
  }

  stop() {
    // Suppress the expected SIGTERM exit 'failure'
    this._logError = false;
    this.process && this.process.kill();
    this.process = null;
  }
}
