import path from 'path'
var walk = require('walkdir')

function findOneUpwards (currentDirectory, matcher, attempts = 0) {

  // No folder with '.meteor/release' in it found
  if (attempts > 50 || currentDirectory === path.sep) {
    return false
  }

  if (matcher(currentDirectory)) {
    return currentDirectory
  }

  return findOneUpwards(path.join(currentDirectory, '..'), matcher, attempts + 1)
}


function findAllDownwards (startPath, matcher) {
  const matchedPaths = []
  const options = {follow_symlinks: false, no_recurse: false, max_depth: 20}
  walk.sync(
    startPath,
    options,
    function (currentPath) {
      if (matcher(currentPath)) {
        matchedPaths.push(currentPath)
        this.ignore(currentPath)
      }
    }
  )
  return matchedPaths
}


export default function getProjectRootPaths (currentDirectory, matcher) {

  if (matcher(currentDirectory)) {
    return [currentDirectory]
  }

  const upwards = findOneUpwards(currentDirectory, matcher)
  if (upwards) {
    return [upwards]
  }

  return findAllDownwards(currentDirectory, matcher)
}
