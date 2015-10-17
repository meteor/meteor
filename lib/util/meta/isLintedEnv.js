import {CLIENT, SERVER, UNIVERSAL, COMPATIBILITY, PACKAGE} from '../environment'

export default function (env) {
  return env === CLIENT || env === SERVER || env === UNIVERSAL || env === COMPATIBILITY || env === PACKAGE
}
