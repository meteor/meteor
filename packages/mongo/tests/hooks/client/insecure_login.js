import { Accounts } from 'meteor/accounts-base'
import { InsecureLogin } from '../insecure_login'

Accounts.callLoginMethod({
  methodArguments: [{ username: 'InsecureLogin' }],
  async userCallback (err) {
    if (err) throw err
    await InsecureLogin.run()
  }
})

export {
  InsecureLogin
}
