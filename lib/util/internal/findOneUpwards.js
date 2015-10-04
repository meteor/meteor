import path from 'path'

export default function findOneUpwards (currentDirectory, matcher) {

  if (matcher(currentDirectory)) {
    return currentDirectory
  }

  // No folder with '.meteor/release' in it found
  if (currentDirectory === path.sep) {
    return false
  }

  return findOneUpwards(path.join(currentDirectory, '..'), matcher)
}
