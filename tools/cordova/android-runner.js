import isopackets from '../isopackets.js'
import files from '../files.js';
import { Console } from '../console.js';

import CordovaRunner from './cordova-runner.js'
import { execFileSyncOrThrow, execFileAsyncOrThrow } from './utils.js'

export default class AndroidRunner extends CordovaRunner {
  constructor(projectContext, cordovaProject, isDevice, options) {
    super(projectContext, cordovaProject, options);
    this.isDevice = isDevice;
  }

  get platform() {
    return 'android';
  }

  get displayName() {
    return this.isDevice ? 'Android Device' : 'Android Emulator';
  }

  checkRequirementsAndSetEnvIfNeeded() {
    const platformsDir = files.pathJoin(this.cordovaProject.projectRoot, 'platforms');
    const modulePath = files.pathJoin(platformsDir, 'android', 'cordova', 'lib', 'check_reqs');
    Promise.await(require(modulePath).run());
  }

  async run(options) {
    return this.cordovaProject.run(this.platform, this.isDevice, options)
  }

  async tailLogs(options) {
    // Make cordova-android handle requirements and set env if needed
    this.checkRequirementsAndSetEnvIfNeeded();

    // Clear logs
    execFileSyncOrThrow('adb', ['logcat', '-c']);

    execFileAsyncOrThrow('adb', ['logcat'], {
      verbose: true,
      lineMapper: null
    });
  }
}
