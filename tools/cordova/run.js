import _ from 'underscore';
import { Console } from '../console.js';
import files from '../files.js';
import isopackets from '../isopackets.js'

import iOSRunner from './ios-runner.js';
import AndroidRunner from './android-runner.js';

export function buildCordovaRunners(projectContext, cordovaProject, targets, options) {
  return _.map(targets, (target) => {
    let targetParts = target.split('-');
    const platform = targetParts[0];
    const isDevice = targetParts[1] === 'device';

    if (platform == 'ios') {
      return new iOSRunner(projectContext, cordovaProject, isDevice, options);
    } else if (platform == 'android') {
      return new AndroidRunner(projectContext, cordovaProject, isDevice, options);
    } else {
      throw new Error(`Unknown platform: ${platform}`);
    }
  });
};
