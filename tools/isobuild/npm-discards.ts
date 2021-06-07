import * as files from "../fs/files";

const hasOwn = Object.prototype.hasOwnProperty;

// This class encapsulates a structured specification of files and
// directories that should be stripped from the node_modules directories
// of Meteor packages during `meteor build`, as requested by calling
// `Npm.discard` in package.js files.
class NpmDiscards {
  private discards: Discards;

  constructor() {
    this.discards = {};
  }

  // Update the current specification of discarded files with additional
  // patterns that should be discarded.
  merge(discards: DiscardsInput): void {
    merge(this.discards, discards);
  }

  shouldDiscard(candidatePath: string, isDirectory?: boolean): boolean {
    if (isDirectory === void 0) {
      isDirectory = files.lstat(candidatePath)?.isDirectory();
    }

    for (let currentPath = candidatePath, parentPath;
         (parentPath = files.pathDirname(currentPath)) !== currentPath;
         currentPath = parentPath) {
      if (files.pathBasename(parentPath) === "node_modules") {
        const packageName = files.pathBasename(currentPath);

        if (hasOwn.call(this.discards, packageName)) {
          let relPath = files.pathRelative(currentPath, candidatePath);

          if (isDirectory) {
            relPath = files.pathJoin(relPath, files.pathSep);
          }

          return this.discards[packageName].some(pattern =>
            matches(pattern, relPath)
          );
        }

        // Stop at the first ancestor node_modules directory we find.
        break;
      }
    }

    return false;
  }
}

function merge(into: Discards, from: DiscardsInput): void {
  Object.keys(from).forEach((packageName: string) => {
    const fromValue = from[packageName];
    const intoValue = hasOwn.call(into, packageName) && into[packageName];

    if (typeof fromValue === "string" || fromValue instanceof RegExp) {
      if (intoValue) {
        intoValue.push(fromValue);
      } else {
        into[packageName] = [fromValue];
      }

    } else if (Array.isArray(fromValue)) {
      if (intoValue) {
        intoValue.push.apply(intoValue, fromValue);
      } else {
        // Make a defensive copy of any arrays passed to `Npm.strip`.
        into[packageName] = Array.from(fromValue);
      }
    }
  });
}

// TODO Improve this. For example we don't currently support wildcard
// string patterns (just use a RegExp if you need that flexibility).
function matches(pattern: DiscardPattern, relPath: string): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(relPath);
  }

  if (pattern.charAt(0) === files.pathSep) {
    return relPath.indexOf(pattern.slice(1)) === 0;
  }

  return relPath.includes(pattern);
}

export default NpmDiscards;
