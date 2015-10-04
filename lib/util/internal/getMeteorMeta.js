import path from 'path'
import ENVIRONMENT from '../environment.js'
import folderNames from '../folderNames.js'

function matchLeft (dirs, list) {
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
  const matchedEnvironment = matchLeft(dirList, specialFolders)

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

function getMeteorFileInfo (relativeFilename) {
  const pathInProjectList = relativeFilename.split(path.sep)
  const environment = determineEnvironment(pathInProjectList)

  return {
    path: relativeFilename,
    env: environment,
    isCompatibilityFile: isCompatibilityFile(environment, pathInProjectList),
    isInMeteorProject: true,
    isMobileConfig: isMobileConfig(relativeFilename),
    isPackageConfig: isPackageConfig(pathInProjectList)
  }
}

export default function getMeteorMeta (relativeFilename) {

  if (!relativeFilename) {

    // not in a Meteor Project
    return {isInMeteorProject: false}
  }

  return getMeteorFileInfo(relativeFilename)
}
