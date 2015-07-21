import _ from 'underscore';
import chalk from 'chalk';
import { Console } from '../console.js';
import files from '../files.js';
import isopackets from '../isopackets.js'

import CordovaRunner from './cordova-runner.js'
import { execFileSyncOrThrow, execFileAsyncOrThrow } from './utils.js'

export default class iOSRunner extends CordovaRunner {
  constructor(projectContext, cordovaProject, isDevice, options) {
    super(projectContext, cordovaProject, options);
    this.isDevice = isDevice;
  }

  get platform() {
    return 'ios';
  }

  get displayName() {
    return this.isDevice ? 'iOS Device' : 'iOS Simulator';
  }

  async run(options = {}) {
    // ios-deploy is super buggy, so we just open xcode and let the user
    // start the app themselves.
    if (this.isDevice) {
      openInXcode(files.pathJoin(this.cordovaProject.projectRoot, 'platforms', 'ios'));
    } else {
      const iosSimBinPath = files.convertToOSPath(
        files.pathJoin(files.getCurrentToolsDir(),
        'tools/node_modules/ios-sim/bin'));
      return this.cordovaProject.run(this.platform, this.isDevice,
        _.extend(options, { extraPaths: [iosSimBinPath] }));
    }
  }

  async tailLogs(options) {
    var logFilePath =
      files.pathJoin(this.cordovaProject.projectRoot, 'platforms', 'ios', 'cordova', 'console.log');
    Console.debug('Printing logs for ios emulator, tailing file', logFilePath);

    // overwrite the file so we don't have to print the old logs
    files.writeFile(logFilePath, '');
    // print the log file
    execFileAsyncOrThrow('tail', ['-f', logFilePath], {
      verbose: true,
      lineMapper: null
    });
  }
}

function openInXcode(projectDir) {
  // XXX this is buggy if your app directory is under something with a space,
  // because the this.projectRoot part is not quoted for sh!
  args = ['-c', 'open ' +
    '"' + projectDir.replace(/"/g, "\\\"") + '"/*.xcodeproj'];

  try {
    execFileSyncOrThrow('sh', args);
  } catch (err) {
    Console.error();
    Console.error(chalk.green("Could not open your project in Xcode."));
    Console.error(chalk.green("Try running again with the --verbose option."));
    Console.error(
      chalk.green("Instructions for running your app on an iOS device: ") +
      Console.url(
        "https://github.com/meteor/meteor/wiki/" +
        "How-to-run-your-app-on-an-iOS-device")
    );
    Console.error();
    process.exit(2);
  }

  Console.info();
  Console.info(
    chalk.green(
      "Your project has been opened in Xcode so that you can run your " +
      "app on an iOS device. For further instructions, visit this " +
      "wiki page: ") +
    Console.url(
      "https://github.com/meteor/meteor/wiki/" +
      "How-to-run-your-app-on-an-iOS-device"
  ));
  Console.info();
}
