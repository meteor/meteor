import path from "node:path";
import { release, EOL } from "node:os";

// All of these functions are attached to files.js for the tool;
// they live here because we need them in boot.js as well to avoid duplicating
// a lot of the code.
//
// Note that this file does NOT contain any of the "perform I/O maybe
// synchronously" functions from files.js; this is intentional, because we want
// to make it very hard to accidentally use fs.*Sync functions in the app server
// after bootup (since they block all concurrency!)

// Detect that we are on a Windows-like Filesystem, such as that in a WSL
// (Windows Subsystem for Linux) even if it otherwise looks like we're on Unix.
// https://github.com/Microsoft/BashOnWindows/issues/423#issuecomment-221627364
export function isWindowsLikeFilesystem() {
  return process.platform === "win32" || release().toLowerCase().includes("microsoft");
}

export function toPosixPath(p: string, partialPath: boolean = false) {
  // Sometimes, you can have a path like \Users\IEUser on windows, and this
  // actually means you want C:\Users\IEUser
  if (p[0] === "\\" && (! partialPath)) {
    p = process.env.SystemDrive + p;
  }

  p = p.replace(/\\/g, '/');
  if (p[1] === ':' && ! partialPath) {
    // transform "C:/bla/bla" to "/c/bla/bla"
    p = '/' + p[0] + p.slice(2);
  }

  return p;
}

export const convertToPosixPath = toPosixPath;

export function toDosPath(p: string, partialPath: boolean = false) {
  if (p[0] === '/' && ! partialPath) {
    if (! /^\/[A-Za-z](\/|$)/.test(p))
      throw new Error("Surprising path: " + p);
    // transform a previously windows path back
    // "/C/something" to "c:/something"
    p = p[1] + ":" + p.slice(2);
  }

  p = p.replace(/\//g, '\\');
  return p;
}

export const convertToWindowsPath = toDosPath;

export function convertToOSPath(standardPath: string, partialPath: boolean = false) {
  if (process.platform === "win32") {
    return toDosPath(standardPath, partialPath);
  }
  return standardPath;
}

export function convertToStandardPath(osPath: string, partialPath: boolean = false) {
  if (process.platform === "win32") {
    return toPosixPath(osPath, partialPath);
  }
  return osPath;
}

export function convertToOSLineEndings(fileContents: string) {
  return fileContents.replace(/\n/g, EOL);
}

export function convertToStandardLineEndings(fileContents: string) {
  // Convert all kinds of end-of-line chars to linuxy "\n".
  return fileContents.replace(new RegExp("\r\n", "g"), "\n")
                     .replace(new RegExp("\r", "g"), "\n");
}


// Return the Unicode Normalization Form of the passed in path string, using
// "Normalization Form Canonical Composition"
export function unicodeNormalizePath(path: string) {
  return (path) ? path.normalize('NFC') : path;
}

// wrappings for path functions that always run as they were on unix (using
// forward slashes)
export function wrapPathFunction<
  TArgs extends any[],
  TResult,
  F extends (...args: TArgs) => TResult,
>(
  f: F,
  partialPath: boolean = false,
): F {
  return function wrapper() {
    if (process.platform === 'win32') {
      const result = f.apply(path, Array.prototype.map.call(
        arguments,
        // if partialPaths is turned on (for path.join mostly)
        // forget about conversion of absolute paths for Windows
        p => toDosPath(p, partialPath),
      ) as TArgs);

      return typeof result === "string"
        ? toPosixPath(result, partialPath)
        : result;
    }
    return f.apply(path, arguments as any);
  } as F;
}

export const pathJoin = wrapPathFunction(path.join, true);
export const pathNormalize = wrapPathFunction(path.normalize);
export const pathRelative = wrapPathFunction(path.relative);
export const pathResolve = wrapPathFunction(path.resolve);
export const pathDirname = wrapPathFunction(path.dirname);
export const pathBasename = wrapPathFunction(path.basename);
export const pathExtname = wrapPathFunction(path.extname);
export const pathIsAbsolute = wrapPathFunction(path.isAbsolute);
export const pathSep = '/';
export const pathDelimiter = ':';
export const pathOsDelimiter = path.delimiter;
