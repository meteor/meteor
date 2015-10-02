import path from 'path'
import invariant from 'invariant'
import find from 'lodash.find'
import ENVIRONMENT from './environment.js'
import folderNames from './folderNames.js'

function matchFirst (dirs, list) {
  for (let i = 0; i < dirs.length; i++) {
    if (list.indexOf(dirs[i]) !== -1) {
      return dirs[i]
    }
  }
  return false
}

function isCompatibilityMode (pathInProjectList) {
  var clientIndex = pathInProjectList.indexOf(folderNames.CLIENT)

  // file is directly in client-folder, so it can't be in COMPATIBILITY
  if (pathInProjectList.length - 2 === clientIndex) {
    return false
  }

  return pathInProjectList[clientIndex + 1] === folderNames.COMPATIBILITY
}

function determineEnvironment (pathInProjectList) {

  if (pathInProjectList[0] === folderNames.PUBLIC) {
    return ENVIRONMENT.PUBLIC
  }

  if (pathInProjectList[0] === folderNames.PRIVATE) {
    return ENVIRONMENT.PRIVATE
  }

  if (pathInProjectList.length > 2 && pathInProjectList[0] === folderNames.PACKAGES) {
    return ENVIRONMENT.PACKAGE
  }

  const specialFolders = [
    folderNames.CLIENT,
    folderNames.SERVER,
    folderNames.TESTS,
    folderNames.NODE_MODULES
  ]

  // remove filename
  const dirList = pathInProjectList.slice(0, -1)
  const matchedEnvironment = matchFirst(dirList, specialFolders)

  switch (matchedEnvironment) {
    case folderNames.CLIENT:
      return ENVIRONMENT.CLIENT
    case folderNames.SERVER:
      return ENVIRONMENT.SERVER
    case folderNames.TESTS:
      return ENVIRONMENT.TEST
    case folderNames.NODE_MODULES:
      return ENVIRONMENT.NODE_MODULE
    default:
      return ENVIRONMENT.UNIVERSAL
  }

}

function stripPathPrefix (parent, child) {
  const normalizedParent = path.normalize(parent)
  const normalizedChild = path.normalize(child)

  invariant(
    normalizedChild.substr(0, normalizedParent.length) === parent,
    'Linted file is not in CWD'
  )

  // also strip the / at the end, which is not in normalizedParent
  return normalizedChild.substr(normalizedParent.length + 1)
}

function isMobileConfig (pathInProject) {
  return pathInProject === 'mobile-config.js'
}

function isCompatibilityFile (environment, pathInProjectList) {
  return environment === ENVIRONMENT.CLIENT && isCompatibilityMode(pathInProjectList)
}

function isPackageConfig (pathInProjectList) {
  if (pathInProjectList.length !== 3) {
    return false
  }

  return pathInProjectList[0] === folderNames.PACKAGES && pathInProjectList[2] === 'package.js'
}

function getMeteorFileInfo (rootPath, filename) {
  const pathInProject = stripPathPrefix(rootPath, filename)
  const pathInProjectList = pathInProject.split(path.sep)
  const environment = determineEnvironment(pathInProjectList)

  return {
    path: pathInProject,
    env: environment,
    isCompatibilityFile: isCompatibilityFile(environment, pathInProjectList),
    isInMeteorProject: true,
    isMobileConfig: isMobileConfig(pathInProject),
    isPackageConfig: isPackageConfig(pathInProjectList)
  }
}

function hasFile (parent, filename) {
  return filename.substr(0, parent.length) === parent
}

export default function getMeteorMeta (rootPaths, filename) {

  if (!Array.isArray(rootPaths)) {
    throw new Error('rootPath must be an array')
  }


  const rootPath = find(rootPaths, function (currentPath) {
    return hasFile(currentPath, filename)
  })

  if (!rootPath) {

    // not in a Meteor Project
    return {isInMeteorProject: false}
  }

  return getMeteorFileInfo(rootPath, filename)
}
