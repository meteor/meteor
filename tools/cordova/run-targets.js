import _ from 'underscore';
import chalk from 'chalk';
import child_process from 'child_process';
import eachline from 'eachline';

import isopackets from '../tool-env/isopackets.js';
import runLog from '../runners/run-log.js';
import { Console } from '../console/console.js';
import files from '../fs/files.js';
import { execFileSync, execFileAsync } from '../utils/processes.js';

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
      openXcodeProject(files.pathJoin(cordovaProject.projectRoot,
        'platforms', 'ios'));
    } else {
      await cordovaProject.run(this.platform, this.isDevice, undefined);

      // Bring iOS Simulator to front (it is called Simulator in Xcode 7)
      execFileAsync('osascript', ['-e',
`tell application "System Events"
  set possibleSimulatorNames to {"iOS Simulator", "Simulator"}
  repeat with possibleSimulatorName in possibleSimulatorNames
    if application process possibleSimulatorName exists then
      set frontmost of process possibleSimulatorName to true
    end if
  end repeat
end tell`]);
    }
  }
}

function openXcodeProject(projectDir) {
  const projectFilename =  files.readdir(projectDir).filter((entry) =>
    { return entry.match(/\.xcodeproj$/i) })[0];

  if (!projectFilename) {
    printFailure(`Couldn't find your Xcode project in directory \
'${files.convertToOSPath(projectDir)}'`);
    return;
  }

  const projectFilePath = files.pathJoin(projectDir, projectFilename);

  try {
    execFileSync('open', [projectFilePath]);

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
  } catch (error) {
    printFailure(`Failed to open your project in Xcode:
${error.message}`);
  }

  function printFailure(message) {
    Console.error();
    Console.error(message);
    Console.error(
      chalk.green("Instructions for running your app on an iOS device: ") +
      Console.url("https://github.com/meteor/meteor/wiki/" +
        "How-to-run-your-app-on-an-iOS-device")
    );
    Console.error();
  }
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

    this.tailLogs(cordovaProject).done();
  }

  async checkPlatformRequirementsAndSetEnv(cordovaProject) {
    // Cordova Android is fairly good at applying various heuristics to find
    // suitable values for JAVA_HOME and ANDROID_HOME, and to augment the PATH
    // with those variables.
    // Unfortunately, this is intertwined with checking requirements, so the
    // only way to get access to this functionality is to run check_reqs and
    // let it modify process.env
    const check_reqs = require(files.pathJoin(
      cordovaProject.projectRoot, 'platforms', this.platform,
      'cordova', 'lib', 'check_reqs'));
    // We can't use check_reqs.run() because that will print the values of
    // JAVA_HOME and ANDROID_HOME to stdout.
    await Promise.all([check_reqs.check_java(),
      check_reqs.check_android().then(check_reqs.check_android_target)]);
  }

  async tailLogs(cordovaProject) {
    cordovaProject.runCommands(`tailing logs for ${this.displayName}`, async () => {
      await this.checkPlatformRequirementsAndSetEnv(cordovaProject);

      // XXX This only works if we have at most one device or one emulator
      // connected. We should find a way to get the target ID from run and use
      // it instead of -d or -e.
      const target = this.isDevice ? "-d" : "-e";

      // Clear logs
      await execFileAsync('adb', [target, 'logcat', '-c']);

      const filterExpressions = ['CordovaLog:D', 'chromium:I',
        'SystemWebViewClient:I', '*:S'];

      const { Log } =
          isopackets.load('cordova-support')['logging'];

      const logStream = eachline((line) => {
        const logEntry = logFromAndroidLogcatLine(Log, line);
        if (logEntry) {
          return `${logEntry}\n`;
        }
      });
      logStream.pipe(process.stdout);

      // Asynchronously start tailing logs to stdout
      execFileAsync('adb', [target, 'logcat',
        ...filterExpressions],
        { destination: logStream });
    });
  }
}

function logFromAndroidLogcatLine(Log, line) {
  // Ignore lines indicating beginning of logging
  if (line.match(/^--------- beginning of /)) {
    return null;
  }

  // Matches logcat brief format
  // "I/Tag(  PID): message"
  let match =
    line.match(/^([A-Z])\/([^\(]*?)\(\s*(\d+)\): (.*)$/);

  if (match) {
    [, priority, tag, pid, message] = match;

    if (tag === 'chromium') {
      // Matches Chromium log format
      // [INFO:CONSOLE(23)] "Bla!", source: http://meteor.local/app/mobileapp.js (23)
      match = message.match(/^\[(.*):(.*)\((\d+)\)\] (.*)$/);

      if (match) {
        [, logLevel, filename, lineNumber, message] = match;

        if (filename === 'CONSOLE') {
          match = message.match(/^\"(.*)\", source: (.*) \((\d+)\)$/);

          if (match) {
            [, message, filename, lineNumber] = match;
            return logFromConsoleOutput(Log, message, filename, lineNumber);
          }
        }
      }
    } else if (tag === 'CordovaLog') {
      // http://meteor.local/mobileappold.js?3c198a97a802ad2c6eab52da0244245e30b964ed: Line 15 : Clicked!

      match = message.match(/^(.*): Line (\d+) : (.*)$/);

      if (match) {
        [, filename, lineNumber, message] = match;
        return logFromConsoleOutput(Log, message, filename, lineNumber);
      }
    }
  }

  if (Console.verbose) {
    return Log.format(
    Log.objFromText(line), { metaColor: 'green', color: true });
  } else {
    return null;
  }
};

function logFromConsoleOutput(Log, message, filename, lineNumber) {
  if (isDebugOutput(message) && !Console.verbose) {
    return null;
  }

  filename = filename.replace(/\?.*$/, '');

  return Log.format({
    time: new Date,
    level: 'info',
    file: filename,
    line: lineNumber,
    message: message,
    program: 'android'
  }, {
    metaColor: 'green',
    color: true
  });
}

function isDebugOutput(message) {
  // Skip the debug output produced by Meteor components.
  return /^METEOR CORDOVA DEBUG /.test(message) ||
    /^HTTPD DEBUG /.test(message);
};
