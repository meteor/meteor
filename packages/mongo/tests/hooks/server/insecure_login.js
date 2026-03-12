import { Meteor } from 'meteor/meteor'
import { Accounts } from 'meteor/accounts-base'
import { InsecureLogin } from '../insecure_login'

// Use Meteor.startup so that boot.js awaits this hook before running tests.
// We explicitly await Accounts.init() to ensure all 8 accounts indexes are
// fully created before the tailable cursor test runs, which has a timing-
// sensitive race condition exposed by concurrent MongoDB operations.
Meteor.startup(async function () {
  await Accounts.init()

  if (!(await Meteor.users.find({ username: 'InsecureLogin' }).countAsync())) {
    await Accounts.createUserAsync({
      username: 'InsecureLogin',
      email: 'test@test.com',
      password: 'password',
      profile: { name: 'InsecureLogin' }
    })
  }

  InsecureLogin.run()
})

Accounts.registerLoginHandler(async function (options) {
  if (!options.username) return
  const user = await Meteor.users.findOneAsync({ username: options.username })
  if (!user) return
  return {
    userId: user._id
  }
})

export { InsecureLogin }
