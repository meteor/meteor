import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { InsecureLogin } from '../insecure_login'

let loginPromise = null

async function waitForClientUserId (expectedUserId, timeoutMs = 5000) {
  const startedAt = Date.now()

  while (Meteor.userId() == null || (expectedUserId && Meteor.userId() !== expectedUserId)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for Meteor.userId() on the client')
    }
    await new Promise(resolve => Meteor.setTimeout(resolve, 10))
  }
}

async function ensureClientLogin () {
  if (Meteor.userId() != null) return

  if (Meteor.loggingIn && Meteor.loggingIn()) {
    await waitForClientUserId()
    return
  }

  if (!loginPromise) {
    loginPromise = (async function () {
      const { userId, token } = await Meteor.callAsync('test_hooks_get_login_token')

      await new Promise((resolve, reject) => {
        Accounts.callLoginMethod({
          methodArguments: [{ resume: token }],
          userCallback (err) {
            if (err) {
              reject(err)
              return
            }
            resolve()
          }
        })
      })

      await waitForClientUserId(userId)
    })().finally(() => {
      loginPromise = null
    })
  }

  await loginPromise
}

InsecureLogin.ensureSession = async function () {
  await ensureClientLogin()
}

export {
  InsecureLogin
}
