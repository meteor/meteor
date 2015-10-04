import {CLIENT, SERVER} from '../environment'
import isMeteorProp from './isMeteorProp'
import invariant from 'invariant'

export function isInBlock (ancestors, env) {

  invariant(Array.isArray(ancestors), 'isInBlock: ancestors is not an array')
  invariant(!!env, 'isInBlock: called without environment')
  invariant(env === CLIENT || env === SERVER, 'isInBlock: unkown environment')

  if (ancestors.length === 0) {
    return false
  }

  let isInServer = false
  let isInClient = false
  for (let i = 0; i < ancestors.length; i++) {
    const ancestor = ancestors[i]

    if (ancestor.type === 'IfStatement' && ancestor.test.type === 'MemberExpression') {
      if (isMeteorProp(ancestor.test, 'isServer')) {
        isInServer = true
      }
      if (isMeteorProp(ancestor.test, 'isClient')) {
        isInClient = true
      }
    }
  }

  switch (env) {
    case SERVER:
      return isInServer && !isInClient
    case CLIENT:
      return !isInServer && isInClient
  }
}

export function isInServerBlock (ancestors) {
  return isInBlock(ancestors, SERVER)
}

export function isInClientBlock (ancestors) {
  return isInBlock(ancestors, CLIENT)
}
