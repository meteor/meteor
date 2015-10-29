import {UNIVERSAL, CLIENT, SERVER} from '../environment'

const meteorEnvRegEx = /^eslint-meteor-env (client|server)\s?(,\s?(client|server))*$/

export default function getEnvFromComments (comments = []) {
  const envs = new Set()
  comments.forEach(comment => {
    const trimmedValue = comment
      .value
      .replace(/\s\s+/g, ' ') // multiple spaces and newlines to one space
      .trim()
    if (meteorEnvRegEx.test(trimmedValue)) {
      trimmedValue
        .substr(18)
        .replace(/\s+/g, '')
        .split(',')
        .map(env => envs.add(env))
    }
  })
  if (envs.has('client') && envs.has('server')) {
    return UNIVERSAL
  } else if (envs.has('client')) {
    return CLIENT
  } else if (envs.has('server')) {
    return SERVER
  }
  return false
}
