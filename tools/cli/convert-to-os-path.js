function toDosPath(path) {
  if (path[0] === "/") {
    if (! /^\/[A-Za-z](\/|$)/.test(path)) {
      throw new Error("Surprising path: " + path);
    }
    // transform a previously windows path back
    // "/C/something" to "c:/something"
    path = path[1] + ":" + path.slice(2);
  }
  return path.split("/").join("\\");
}

function convertToOSPath(path) {
  if (process.platform === "win32") {
    return toDosPath(path);
  }
  return path;
}

exports.convertToOSPath = convertToOSPath;
