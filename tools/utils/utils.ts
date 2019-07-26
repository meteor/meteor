import _ from 'underscore';
import semver from 'semver';
import os from 'os';
import url, { UrlObject } from 'url';
import child_process, { SpawnOptions, ExecOptions } from 'child_process';

import'./fiber-helpers.js';
import * as archinfo from './archinfo';
const buildmessage = require('./buildmessage');
import * as files from '../fs/files';
import packageVersionParser from '../packaging/package-version-parser.js';

// XXX: Defined these in a global .d.ts file or better in @types/netroute
type NetrouteInfoIP = {
  interface: string;
  destination: string;
}

type NetrouteInfo = {
  IPv4: NetrouteInfoIP[];
  IPv6: NetrouteInfoIP[];
}

// XXX: Define and move this into console.js 
type ConsolePrintTwoColumnsOptions = {}

type ExecFileResponse = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type AgentInfo = {
  host?: string;
  agent: string;
  agentVersion: string;
  arch: string;
}

type PackageOptions = {
  useBuildmessage?: string;
  buildmessageFile?: string;
}

// Parses <protocol>://<host>:<port> into an object { protocol: *, host:
// *, port: * }. The input can also be of the form <host>:<port> or just
// <port>. We're not simply using 'url.parse' because we want '3000' to
// parse as {host: undefined, protocol: undefined, port: '3000'}, whereas
// 'url.parse' would give us {protocol:' 3000', host: undefined, port:
// undefined} or something like that.
//
// 'defaults' is an optional object with 'hostname', 'port', and 'protocol' keys.
export function parseUrl(str: string, defaults: UrlObject = {}) {
  // XXX factor this out into a {type: host/port}?

  const defaultHostname = defaults.hostname || undefined;
  const defaultPort = defaults.port || undefined;
  const defaultProtocol = defaults.protocol || undefined;

  if (str.match(/^[0-9]+$/)) { // just a port
    return {
      port: str,
      hostname: defaultHostname,
      protocol: defaultProtocol };
  }

  const hasSchemeResult = hasScheme(str);
  if (! hasSchemeResult) {
    str = "http://" + str;
  }

  const parsed = url.parse(str);

  // for consistency remove colon at the end of protocol
  parsed.protocol = (parsed.protocol || '').replace(/\:$/, '');

  return {
    protocol: hasSchemeResult ? parsed.protocol : defaultProtocol,
    hostname: parsed.hostname || defaultHostname,
    port: parsed.port || defaultPort
  };
};

// 'options' is an object with 'hostname', 'port', and 'protocol' keys, such as
// the return value of parseUrl.
export function formatUrl(options: UrlObject) {
  // For consistency with `Meteor.absoluteUrl`, add a trailing slash to make
  // this a valid URL
  if (!options.pathname)
    options.pathname = "/";

  return url.format(options);
};

export function ipAddress() {
  let defaultRoute: NetrouteInfoIP | undefined;
  // netroute is not available on Windows
  if (process.platform !== "win32") {
    const netroute = require('netroute');
    const info: NetrouteInfo = netroute.getInfo();
    defaultRoute = _.findWhere(info.IPv4 || [], { destination: "0.0.0.0" });
  }

  const interfaces = os.networkInterfaces();

  if (defaultRoute) {
    // If we know the default route, find the IPv4 address associated
    // with that interface
    const iface = defaultRoute["interface"];
    const addressEntry = _.findWhere(interfaces[iface], { family: "IPv4" });

    if (!addressEntry) {
      throw new Error(
`Network interface '${iface}', which seems to be the default route,
not found in interface list, or does not have an IPv4 address.`);
    }

    return addressEntry.address;
  } else {
    // If we don't know the default route, we'll lookup all non-internal
    // IPv4 addresses and hope to find only one
    const addressEntries: os.NetworkInterfaceInfo[] = _.chain(interfaces)
      .values()
      .flatten()
      .where({ family: "IPv4", internal: false })
      .value();

    if (addressEntries.length == 0) {
      throw new Error(`Could not find a network interface with a non-internal IPv4 address.`);
    } else if (addressEntries.length > 1) {
      const addressEntriesStr = addressEntries.map(entry => entry.address).join(', ');
      throw new Error(
`Found multiple network interfaces with non-internal IPv4 addresses:
${addressEntriesStr}`);
    } else {
      return addressEntries[0].address;
    }
  }
};

export function hasScheme(str: string): boolean {
  return !! str.match(/^[A-Za-z][A-Za-z0-9+-\.]*\:\/\//);
};

export function isIPv4Address(str: string): RegExpMatchArray | null {
  return str.match(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/);
}

// XXX: Move to e.g. formatters.js?
// Prints a package list in a nice format.
// Input is an array of objects with keys 'name' and 'description'.
export function printPackageList(items: Array<{name: string; description?: string}>, options: ConsolePrintTwoColumnsOptions = {}) {
  const sortedItems = _.sortBy(items, item => item.name);

  const sortedRows = _.map(sortedItems, item => [item.name, item.description || 'No description']);

  const Console = require('../console/console.js').Console;
  return Console.printTwoColumns(sortedRows, options);
};

// Determine a human-readable hostname for this computer. Prefer names
// that make sense to users (eg, the name they manually gave their
// computer on OS X, which might contain spaces) over names that have
// any particular technical significance (eg, might resolve in DNS).
export function getHost(): string {
  let ret;
  const attempt = function (...args: string[]) {
    const output = execFileSync(args[0], args.slice(1)).stdout;
    if (output) {
      ret = output.trim();
    }
  };

  if (archinfo.matches(archinfo.host(), 'os.osx')) {
    // On OSX, to get the human-readable hostname that the user chose,
    // we call:
    //   scutil --get ComputerName
    // This can contain spaces. See
    // http://osxdaily.com/2012/10/24/set-the-hostname-computer-name-and-bonjour-name-separately-in-os-x/
    if (! ret) {
      attempt("scutil", "--get", "ComputerName");
    }
  }

  if (archinfo.matches(archinfo.host(), 'os.osx') ||
      archinfo.matches(archinfo.host(), 'os.linux')) {
    // On Unix-like platforms, try passing -s to hostname to strip off
    // the domain name, to reduce the extent to which the output
    // varies with DNS.
    if (! ret) {
      attempt("hostname", "-s");
    }
  }

  // Try "hostname" on any platform. It should work on
  // Windows. Unknown platforms that have a command called "hostname"
  // that deletes all of your files deserve what the get.
  if (! ret) {
    attempt("hostname");
  }

  // Otherwise, see what Node can come up with.
  return ret || os.hostname();
};

// Return standard info about this user-agent. Used when logging in to
// Meteor Accounts, mostly so that when the user is seeing a list of
// their open sessions in their profile on the web, they have a way to
// decide which ones they want to revoke.
export function getAgentInfo(): AgentInfo {
  const host = getHost();

  const agentInfo: AgentInfo = {
    agent: "Meteor",
    agentVersion: files.inCheckout() ? "checkout" : files.getToolsVersion(),
    arch: archinfo.host()
  };

  if (host) {
    agentInfo.host = host;
  }

  return agentInfo;
};

// Wait for 'ms' milliseconds, and then return. Yields. (Must be
// called within a fiber, and blocks only the calling fiber, not the
// whole program.)
export function sleepMs(ms: number): void {
  if (ms <= 0) {
    return;
  }

  new Promise(function (resolve) {
    setTimeout(resolve, ms);
  }).await();
};

// Return a short, high entropy string without too many funny
// characters in it.
export function randomToken(): string {
  return (Math.random() * 0x100000000 + 1).toString(36);
};

// Like utils.randomToken, except a legal variable name, i.e. the first
// character is guaranteed to be [a-z] and the rest [a-z0-9].
export function randomIdentifier(): string {
  const firstLetter = String.fromCharCode(
    "a".charCodeAt(0) + Math.floor(Math.random() * 26));
  return firstLetter + Math.random().toString(36).slice(2);
};

// Returns a random non-privileged port number.
export function randomPort(): number {
  return 20000 + Math.floor(Math.random() * 10000);
};

// Like packageVersionParser.parsePackageConstraint, but if called in a
// buildmessage context uses buildmessage to raise errors.
export function parsePackageConstraint(constraintString: string, options?: PackageOptions) {
  try {
    return packageVersionParser.parsePackageConstraint(constraintString);
  } catch (e) {
    if (! (e.versionParserError && options && options.useBuildmessage)) {
      throw e;
    }
    buildmessage.error(e.message, { file: options.buildmessageFile });
    return null;
  }
};

export function validatePackageName(name: string, options?: PackageOptions) {
  try {
    return packageVersionParser.validatePackageName(name, options);
  } catch (e) {
    if (! (e.versionParserError && options && options.useBuildmessage)) {
      throw e;
    }
    buildmessage.error(e.message, { file: options.buildmessageFile });
    return null;
  }
};

// Parse a string of the form `package + " " + version` into an object
// of the form {package, version}.  For backwards compatibility,
// an "@" separator instead of a space is also accepted.
//
// Lines of `.meteor/versions` are parsed using this function, among
// other uses.
export function parsePackageAndVersion(packageAtVersionString: string, options?: PackageOptions) {
  let error = null;
  const separatorPos = Math.max(packageAtVersionString.lastIndexOf(' '),
                              packageAtVersionString.lastIndexOf('@'));
  if (separatorPos < 0) {
    error = new Error("Malformed package version: " +
                      JSON.stringify(packageAtVersionString));
  } else {
    const packageName = packageAtVersionString.slice(0, separatorPos);
    const version = packageAtVersionString.slice(separatorPos+1);
    try {
      packageVersionParser.validatePackageName(packageName);
      // validate the version, ignoring the parsed result:
      packageVersionParser.parse(version);
    } catch (e) {
      if (! e.versionParserError) {
        throw e;
      }
      error = e;
    }
    if (! error) {
      return { package: packageName, version: version };
    }
  }
  // `error` holds an Error
  if (! (options && options.useBuildmessage)) {
    throw error;
  }
  buildmessage.error(error.message, { file: options.buildmessageFile });
  return null;
};

// Check for invalid package names. Currently package names can only contain
// ASCII alphanumerics, dash, and dot, and must contain at least one letter. For
// safety reasons, package names may not start with a dot. Package names must be
// lowercase.
//
// These do not check that the package name is valid in terms of our naming
// scheme: ie, that it is prepended by a user's username. That check should
// happen at publication time.
//
// 3 variants: isValidPackageName just returns a bool.  validatePackageName
// throws an error marked with 'versionParserError'. validatePackageNameOrExit
// (which should only be used inside the implementation of a command, not
// eg package-client.js) prints and throws the "exit with code 1" exception
// on failure.

export function isValidPackageName(packageName: string): boolean {
  try {
    validatePackageName(packageName);
    return true;
  } catch (e) {
    if (!e.versionParserError) {
      throw e;
    }
    return false;
  }
};

export function validatePackageNameOrExit(packageName: string, options?: PackageOptions) {
  try {
    validatePackageName(packageName, options);
  } catch (e) {
    if (!e.versionParserError) {
      throw e;
    }
    const Console = require('../console/console.js').Console;
    Console.error(e.message, Console.options({ bulletPoint: "Error: " }));
    // lazy-load main: old bundler tests fail if you add a circular require to
    // this file
    const main = require('../tests/apps/app-using-stylus/main.js');
    throw new main.ExitWithCode(1);
  }
};

// True if this looks like a valid email address. We deliberately
// don't support
// - quoted usernames (eg, "foo"@bar.com, " "@bar.com, "@"@bar.com)
// - IP addresses in domains (eg, foo@1.2.3.4 or the IPv6 equivalent)
// because they're weird and we don't want them in our database.
export function validEmail(address: string): boolean {
  return /^[^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*@([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}$/.test(address);
};

// Like Perl's quotemeta: quotes all regexp metacharacters. See
//   https://github.com/substack/quotemeta/blob/master/index.js
export function quotemeta(str: string): string {
    return String(str).replace(/(\W)/g, '\\$1');
};

// Allow a simple way to scale up all timeouts from the command line
let localTimeoutScaleFactor = 1.0;
if (process.env.TIMEOUT_SCALE_FACTOR) {
  localTimeoutScaleFactor = parseFloat(process.env.TIMEOUT_SCALE_FACTOR);
}
export const timeoutScaleFactor = localTimeoutScaleFactor;

// If the given version matches a template (essentially,  -style, but with
// a bounded number of digits per number part, and with no restriction on the
// amount of number parts, and some restrictions on legal prerelease labels),
// then return an orderKey for it. Otherwise return null.
//
// This conventional orderKey pads each part (with 0s for numbers, and ! for
// prerelease tags), and appends a $. (Because ! sorts before $, this means that
// the prerelease for a given release will sort before it. Because $ sorts
// before '.', this means that 1.2 will sort before 1.2.3.)
export function defaultOrderKeyForReleaseVersion(version: string): string | null {
  const match = version.match(/^(\d{1,4}(?:\.\d{1,4})*)(?:-([-A-Za-z.]{1,15})(\d{0,4}))?$/);
  if (!match) {
    return null;
  }

  const numberPart = match[1];
  const prereleaseTag = match[2];
  const prereleaseNumber = match[3];

  function hasRedundantLeadingZero(x: string): boolean {
    return x.length > 1 && x[0] === '0';
  };

  function leftPad(chr: string, len: number, str: string): string {
    if (str.length > len) {
      throw Error("too long to pad!");
    }
    return str.padStart(len, chr);
  };

  function rightPad(chr: string, len: number, str: string): string {
    if (str.length > len) {
      throw Error("too long to pad!");
    }
    return str.padEnd(len, chr);
  };

  // Versions must have no redundant leading zeroes, or else this encoding would
  // be ambiguous.
  const numbers = numberPart.split('.');
  if (_.any(numbers, hasRedundantLeadingZero)) {
    return null;
  }
  if (prereleaseNumber && hasRedundantLeadingZero(prereleaseNumber)) {
    return null;
  }

  // First, put together the non-prerelease part.
  let ret = _.map(numbers, number => leftPad('0', 4, number)).join('.');

  if (!prereleaseTag) {
    return ret + '$';
  }

  ret += '!' + rightPad('!', 15, prereleaseTag);
  if (prereleaseNumber) {
    ret += leftPad('0', 4, prereleaseNumber);
  }

  return ret + '$';
};

// XXX should be in files.js
export function isDirectory(dir: string) {
  try {
    // use stat rather than lstat since symlink to dir is OK
    const stats = files.stat(dir);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
};

// Calls cb with each subset of the array "total", with non-decreasing size,
// until all subsets have been used or cb returns true. The array passed
// to cb may be safely mutated or retained by cb.
export function generateSubsetsOfIncreasingSize(total: string[], cb: (elements: string[]) => boolean) {
  // We'll throw this if cb ever returns true, which is a simple way to pop us
  // out of our recursion.
  class Done {};

  // Generates all subsets of size subsetSize which contain the indices already
  // in chosenIndices (and no indices that are "less than" any of them).
  const generateSubsetsOfFixedSize = function (goalSize: number, chosenIndices: number[]) {
    // If we've found a subset of the size we're looking for, output it.
    if (chosenIndices.length === goalSize) {
      // Change from indices into the actual elements. Note that 'elements' is
      // a newly allocated array which cb may mutate or retain.
      const elements: string[] = [];
      _.each(chosenIndices, function (index) {
        elements.push(total[index]);
      });
      if (cb(elements)) {
        throw new Done();  // unwind all the recursion
      }
      return;
    }

    // Otherwise try adding another index and call this recursively.  We're
    // trying to produce a sorted list of indices, so if there are already
    // indices, we start with the one after the biggest one we already have.
    const firstIndexToConsider = chosenIndices.length ?
          chosenIndices[chosenIndices.length - 1] + 1 : 0;
    for (let i = firstIndexToConsider; i < total.length; ++i) {
      const withThisChoice = _.clone(chosenIndices);
      withThisChoice.push(i);
      generateSubsetsOfFixedSize(goalSize, withThisChoice);
    }
  };

  try {
    for (let goalSize = 0; goalSize <= total.length; ++goalSize) {
      generateSubsetsOfFixedSize(goalSize, []);
    }
  } catch (e) {
    if (!(e instanceof Done)) {
      throw e;
    }
  }
};

export function isUrlWithFileScheme(x: string): boolean {
  return /^file:\/\/.+/.test(x);
};

export function isUrlWithSha(x: string): boolean {
  // Is a URL with a fixed SHA? We use this for Cordova -- although theoretically we could use
  // a URL like isNpmUrl(), there are a variety of problems with this,
  // see https://github.com/meteor/meteor/pull/5562
  return /^https?:\/\/.*[0-9a-f]{40}/.test(x);
}

export function isNpmUrl(x: string): boolean {
  // These are the various protocols that NPM supports, which we use to download NPM dependencies
  // See https://docs.npmjs.com/files/package.json#git-urls-as-dependencies
  return isUrlWithSha(x) ||
    /^(git|git\+ssh|git\+http|git\+https|https|http)?:\/\//.test(x);
};

export function isPathRelative(x: string): boolean {
  return x.charAt(0) !== '/';
};

// If there is a version that isn't valid, throws an Error with a
// human-readable message that is suitable for showing to the user.
// dependencies may be falsey or empty.
//
// This is talking about NPM/Cordova versions specifically, not Meteor versions.
// It does not support the wrap number syntax.
export function ensureOnlyValidVersions(dependencies: string[], {forCordova}: {forCordova: boolean}) {
  _.each(dependencies, function (version, name) {
    // We want a given version of a smart package (package.js +
    // .npm/npm-shrinkwrap.json) to pin down its dependencies precisely, so we
    // don't want anything too vague. For now, we support semvers and urls that
    // name a specific commit by SHA.
    if (! isValidVersion(version, {forCordova})) {
      throw new Error(
        "Must declare valid version of dependency: " + name + '@' + version);
    }
  });
};
export function isValidVersion(version: string, {forCordova}: {forCordova: boolean}) {
  return semver.valid(version) || isUrlWithFileScheme(version)
    || (forCordova ? isUrlWithSha(version): isNpmUrl(version));
};

export function execFileSync(file: string, args: string[], opts: ExecOptions & {pipeOutput?: boolean} = {}): ExecFileResponse {
  const { eachline } = require('./eachline');

  if (! _.has(opts, 'maxBuffer')) {
    opts.maxBuffer = 1024 * 1024 * 10;
  }

  if (opts && opts.pipeOutput) {
    const p = child_process.spawn(file, args, opts);

    eachline(p.stdout, function (line: string) {
      process.stdout.write(line + '\n');
    });

    eachline(p.stderr, function (line: string) {
      process.stderr.write(line + '\n');
    });

    return {
      success: ! new Promise(function (resolve) {
        p.on('exit', resolve);
      }).await(),
      stdout: "",
      stderr: ""
    };
  }

  return new Promise<ExecFileResponse>(function (resolve) {
    child_process.execFile(file, args, opts, function (err, stdout, stderr) {
      resolve({
        success: ! err,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  }).await();
};

// WARN: This function doesn't seem to be used anywhere
export function execFileAsync(file: string, args: string[], opts: SpawnOptions & {lineMapper?: (line: string) => string; verbose?: boolean}) {
  opts = opts || {};
  const { eachline } = require('./eachline');
  const p = child_process.spawn(file, args, opts);
  const mapper = opts.lineMapper || _.identity;

  function logOutput(line: string) {
    if (opts.verbose) {
      line = mapper(line);
      if (line) {
        console.log(line);
      }
    }
  }

  eachline(p.stdout, logOutput);
  eachline(p.stderr, logOutput);

  return p;
};


export function runGitInCheckout(...args: string[]) {
  args.unshift(
    '--git-dir=' +
    files.convertToOSPath(files.pathJoin(files.getCurrentToolsDir(), '.git')));

  return execFileSync('git', args).stdout;
};


export class Throttled {
  interval: number;
  next: number;

  constructor(options?: {interval?: number}) {
    const actualOptions = _.extend({ interval: 150 }, options || {});
    this.interval = actualOptions.interval;

    const now = +(new Date);
    this.next = now;
  }

  isAllowed(){
    const now = +(new Date);

    if (now < this.next) {
      return false;
    }

    this.next = now + this.interval;
    return true;
  }
}

// ThrottledYield just regulates the frequency of calling yield.
// It should behave similarly to calling yield on every iteration of a loop,
// except that it won't actually yield if there hasn't been a long enough time interval
//
// options:
//   interval: minimum interval of time between yield calls
//             (more frequent calls are simply dropped)
export class ThrottledYield {
  _throttle: Throttled;
  
  constructor(options?: {interval?: number}) {
    this._throttle = new Throttled(options);
  }

  yield() {
    if (this._throttle.isAllowed()) {
      // setImmediate allows signals and IO to be processed but doesn't
      // otherwise add time-based delays. It is better for yielding than
      // process.nextTick (which doesn't allow signals or IO to be processed) or
      // setTimeout 1 (which adds a minimum of 1 ms and often more in delays).
      // XXX Actually, setImmediate is so fast that we might not even need
      // to use the throttler at all?
      new Promise(setImmediate).await();
    }
  }
}

// Use this to convert dates into our preferred human-readable format.
//
// Takes in either null, a raw date string (ex: 2014-12-09T18:37:48.977Z) or a
// date object and returns a long-form human-readable date (ex: December 9th,
// 2014) or unknown for null.
export function longformDate(date?: string | Date) {
  if (! date) {
    return "Unknown";
  }
  const moment = require('moment');
  const pubDate = moment(date).format('MMMM Do, YYYY');
  return pubDate;
};

// Length of the longest possible string that could come out of longformDate
// (September is the longest month name, so "September 24th, 2014" would be an
// example).
export const maxDateLength = "September 24th, 2014".length;

// Returns a sha256 hash of a given string.
export function sha256(contents: string) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(contents);
  return hash.digest('base64');
};

export function sourceMapLength(sm?: {mappings: number[], sourcesContent?: string[]}) {
  if (! sm) {
    return 0;
  }
  // sum the length of sources and the mappings, the size of
  // metadata is ignored, but it is not a big deal
  return sm.mappings.length
       + (sm.sourcesContent || []).reduce((soFar, current) => {
         return soFar + (current ? current.length : 0);
       }, 0);
};

// Find and return the current OS architecture, in "uname -m" format.
//
// For Linux and macOS (Darwin) this means first getting the current
// architecture reported by Node using "os.arch()" (e.g. ia32, x64), then
// converting it to a "uname -m" matching architecture label (e.g. i686,
// x86_64).
//
// For Windows things are handled differently. Node's "os.arch()" will return
// "ia32" for both 32-bit and 64-bit versions of Windows (since we're using
// a 32-bit version of Node on Windows). Instead we'll look for the presence
// of the PROCESSOR_ARCHITEW6432 environment variable to determine if the
// Windows architecture is 64-bit, then convert to a "uname -m" matching
// architecture label (e.g. i386, x86_64).
export function architecture() {
  const supportedArchitectures: { [osType: string]: { [osArch: string]: string }} = {
    Darwin: {
      x64: 'x86_64',
    },
    Linux: {
      ia32: 'i686',
      x64: 'x86_64',
    },
    Windows_NT: {
      ia32: process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')
              ? 'x86_64'
              : 'i386',
      x64: 'x86_64'
    }
  };

  const osType = os.type();
  const osArch = os.arch();
 
  if (!supportedArchitectures[osType]) {
    throw new Error(`Unsupported OS ${osType}`);
  }

  if (!supportedArchitectures[osType][osArch]) {
    throw new Error(`Unsupported architecture ${osArch}`);
  }

  return supportedArchitectures[osType][osArch];
};

let emacsDetected: boolean | undefined;
export function isEmacs(): boolean {
  // Checking `process.env` is expensive, so only check once.
  if (typeof emacsDetected === "boolean") {
    return emacsDetected;
  }

  // Prior to v22, Emacs only set EMACS. After v27, it only sets INSIDE_EMACS.
  emacsDetected = !! (process.env.EMACS === "t" || process.env.INSIDE_EMACS);
  return emacsDetected;
}
