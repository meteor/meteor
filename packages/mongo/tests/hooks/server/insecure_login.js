import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { InsecureLogin } from '../insecure_login'

const HOOK_TEST_USERNAME = 'InsecureLogin'
const HOOK_TEST_EMAIL = 'test@test.com'
const HOOK_TEST_PASSWORD = 'password'
let ensureHookTestUserPromise = null

async function ensureHookTestUser () {
  if (!ensureHookTestUserPromise) {
    ensureHookTestUserPromise = (async function () {
      await Accounts.init()

      let user = await Meteor.users.findOneAsync({ username: HOOK_TEST_USERNAME })
      if (!user) {
        const userId = await Accounts.createUserAsync({
          username: HOOK_TEST_USERNAME,
          email: HOOK_TEST_EMAIL,
          password: HOOK_TEST_PASSWORD,
          profile: { name: HOOK_TEST_USERNAME }
        })

        user = await Meteor.users.findOneAsync(userId)
      }

      return user
    })().finally(() => {
      ensureHookTestUserPromise = null
    })
  }

  return await ensureHookTestUserPromise
}

// Use Meteor.startup so that boot.js awaits this hook before running tests.
// We explicitly await Accounts.init() to ensure all 8 accounts indexes are
// fully created before the tailable cursor test runs, which has a timing-
// sensitive race condition exposed by concurrent MongoDB operations.
Meteor.startup(async function () {
  await ensureHookTestUser()
})

InsecureLogin.ensureSession = async function () {
  await ensureHookTestUser()
}

Meteor.methods({
  async test_hooks_get_login_token () {
    const user = await ensureHookTestUser()
    if (!user) {
      throw new Meteor.Error('hook-test-user-missing', 'Hook test user was not created')
    }

    const stampedToken = Accounts._generateStampedLoginToken()
    await Accounts._insertLoginToken(user._id, stampedToken)

    return {
      userId: user._id,
      token: stampedToken.token
    }
  }
})

export { InsecureLogin }
