import _ from 'underscore';
import chalk from 'chalk';
import child_process from 'child_process';

import runLog from '../runners/run-log.js';
import { Console } from '../console/console.js';
import files from '../fs/files.js';

export class CordovaRunTarget {
  get title() {
    return `app on ${this.displayName}`;
  }
}

export class iOSRunTarget extends CordovaRunTarget {
  constructor(isDevice) {
    super();
    this.platform = 'ios';
    this.isDevice = isDevice;
  }

  get displayName() {
    return this.isDevice ? "iOS Device" : "iOS Simulator";
  }

  async start(cordovaProject) {
    // ios-deploy is super buggy, so we just open Xcode and let the user
    // start the app themselves.
    if (this.isDevice) {
      // Make sure we prepare the platform, which is normally done as part of
      // running
      this.cordovaProject.prepareForPlatform(this.platform);
      openXcodeProject(files.pathJoin(cordovaProject.projectRoot,
        'platforms', 'ios', `${cordovaProject.appName}.xcodeproj`));
    } else {
      // Add the cordova package npm bin path so Cordova can find ios-sim
      const cordovaBinPath = files.convertToOSPath(
        files.pathJoin(files.getCurrentToolsDir(),
        'packages/cordova/.npm/package/node_modules/.bin'));

      await cordovaProject.run(this.platform, this.isDevice, undefined,
        [cordovaBinPath]);

      // Bring iOS Simulator to front
      child_process.spawn('osascript', ['-e',
        'tell application "System Events" \
        to set frontmost of process "iOS Simulator" to true']);
    }
  }
}

function openXcodeProject(projectPath) {
  child_process.execFile('open', [projectPath], undefined,
    (error, stdout, stderr) => {
    if (error) {
      Console.error();
      Console.error(chalk.green(`Failed to open your project in Xcode:
${error.message}`));
      Console.error(
        chalk.green("Instructions for running your app on an iOS device: ") +
        Console.url("https://github.com/meteor/meteor/wiki/" +
          "How-to-run-your-app-on-an-iOS-device")
      );
      Console.error();
    } else {
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
  });
}

export class AndroidRunTarget extends CordovaRunTarget {
  constructor(isDevice) {
    super();
    this.platform = 'android';
    this.isDevice = isDevice;
  }

  get displayName() {
    return this.isDevice ? "Android Device" : "Android Emulator";
  }

  async start(cordovaProject) {
    await cordovaProject.run(this.platform, this.isDevice);
  }
}
