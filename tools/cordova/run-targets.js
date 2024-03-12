import chalk from 'chalk';

import { loadIsopackage } from '../tool-env/isopackets.js';
import { Console } from '../console/console.js';
import files from '../fs/files';
import { execFileAsync } from '../utils/processes';

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
      await openXcodeProject(files.pathJoin(cordovaProject.projectRoot,
        'platforms', 'ios'));
    } else {
      await cordovaProject.run(this.platform, this.isDevice, undefined);

      // Bring iOS Simulator to front (it is called Simulator in Xcode 7)
      await execFileAsync('osascript', ['-e',
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

async function openXcodeProject(projectDir) {
  const projectFilename = files.readdir(projectDir).filter((entry) => {
    return entry.match(/\.xcodeproj$/i);
  })[0];

  if (!projectFilename) {
    printFailure(`Couldn't find your Xcode project in directory \
'${files.convertToOSPath(projectDir)}'`);
    return;
  }

  try {
    await execFileAsync("open", ["-a", "Xcode", projectDir]);

    Console.info();
    Console.info(
      chalk.green(
        "Your project has been opened in Xcode so that you can run your " +
          "app on an iOS device. For further instructions, visit this " +
          "wiki page: "
      ) + Console.url("https://guide.meteor.com/cordova.html#running-on-ios")
    );
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
        Console.url("https://guide.meteor.com/cordova.html#running-on-ios")
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
    // XXX This only works if we have at most one device or one emulator
    // connected. We should find a way to get the target ID from run and use
    // it instead of -d or -e.
    let target = this.isDevice ? "-d" : "-e";

    // Clear logs
    await execFileAsync('adb', [target, 'logcat', '-c']);

    await cordovaProject.run(this.platform, this.isDevice);

    this.tailLogs(cordovaProject, target).done();
  }

  async checkPlatformRequirementsAndSetEnv(cordovaProject) {
    // Cordova Android is fairly good at applying various heuristics to find
    // suitable values for JAVA_HOME and ANDROID_HOME, and to augment the PATH
    // with those variables.
    // Unfortunately, this is intertwined with checking requirements, so the
    // only way to get access to this functionality is to run check_reqs and
    // let it modify process.env
    // cordova-android 10 and beyond will not include the API files in the project
    // so we need to load it from the dev bundle
    const projectPath = files.pathJoin(
        cordovaProject.projectRoot, 'platforms', this.platform);
    const check_reqs = require("cordova-android/lib/check_reqs");
    // We can't use check_reqs.run() because that will print the values of
    // JAVA_HOME and ANDROID_HOME to stdout.
    await check_reqs.check_all(projectPath);
  }

  async tailLogs(cordovaProject, target) {
    const { transform } = require("../utils/eachline");

    await cordovaProject.runCommands(`tailing logs for ${this.displayName}`, async () => {
      await this.checkPlatformRequirementsAndSetEnv(cordovaProject);

      const logLevel = Console.verbose ? "V" : "I";

      const filterExpressions = [`MeteorWebApp:${logLevel}`,
        `CordovaLog:${logLevel}`, `chromium:${logLevel}`,
        `SystemWebViewClient:${logLevel}`, '*:F'];

      const { Log } = loadIsopackage('logging');

      const logStream = transform(line => {
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
    let priority, tag, pid, message, logLevel, filename, lineNumber;

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

  return Log.format(Log.objFromText(line), { metaColor: 'green', color: true });
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
