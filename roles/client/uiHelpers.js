/* global Meteor, Roles, Match, Package */

/**
 * Convenience functions for use on client.
 *
 * NOTE: You must restrict user actions on the server-side; any
 * client-side checks are strictly for convenience and must not be
 * trusted.
 *
 * @module UIHelpers
 */

// //////////////////////////////////////////////////////////
// UI helpers
//
// Use a semi-private variable rather than declaring UI
// helpers directly so that we can unit test the helpers.
// XXX For some reason, the UI helpers are not registered
// before the tests run.
//
Roles._uiHelpers = {

  /**
   * UI helper to check if current user is in at least one
   * of the target roles.  For use in client-side templates.
   *
   * @example
   *     {{#if isInRole 'admin'}}
   *     {{/if}}
   *
   *     {{#if isInRole 'editor,user'}}
   *     {{/if}}
   *
   *     {{#if isInRole 'editor,user' 'scope1'}}
   *     {{/if}}
   *
   * @method isInRole
   * @param {String} role Name of role or comma-seperated list of roles.
   * @param {String} [scope] Optional, name of scope to check.
   * @return {Boolean} `true` if current user is in at least one of the target roles.
   * @static
   * @for UIHelpers
   */
  isInRole: function (role, scope) {
    const user = Meteor.user()
    const comma = (role || '').indexOf(',')
    let roles

    if (!user) return false
    if (!Match.test(role, String)) return false

    if (comma !== -1) {
      roles = role.split(',').reduce(function (memo, r) {
        if (!r) {
          return memo
        }
        memo.push(r)
        return memo
      }, [])
    } else {
      roles = [role]
    }

    if (Match.test(scope, String)) {
      return Roles.userIsInRole(user, roles, scope)
    }

    return Roles.userIsInRole(user, roles)
  }
}

// //////////////////////////////////////////////////////////
// Register UI helpers
//

if (Roles.debug && console.log) {
  console.log('[roles] Roles.debug =', Roles.debug)
}

if (typeof Package.blaze !== 'undefined' &&
    typeof Package.blaze.Blaze !== 'undefined' &&
    typeof Package.blaze.Blaze.registerHelper === 'function') {
  Object.entries(Roles._uiHelpers).forEach(([name, func]) => {
    if (Roles.debug && console.log) {
      console.log('[roles] registering Blaze helper \'' + name + '\'')
    }
    Package.blaze.Blaze.registerHelper(name, func)
  })
}
