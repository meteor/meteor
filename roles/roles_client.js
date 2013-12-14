;(function () {

/**
 * Convenience functions for use on client.
 *
 * NOTE: You must restrict user actions on the server-side; any
 * client-side checks are strictly for convenience and must not be
 * trusted.
 *
 * @module Helpers
 */

////////////////////////////////////////////////////////////
// Handlebars helpers
//
// Use a semi-private variable rather than declaring Handlebars
// helpers directly so that we can unit test the helpers.
// XXX For some reason, the Handlebars helpers are not registered 
// before the tests run.
//
Roles._handlebarsHelpers = {

  /**
   * Handlebars helper to check if current user is in at least one
   * of the target roles.  For use in client-side templates.
   *
   * NOTE: This helper does not currently support specifying a group.  
   *       If Meteor.user() has per-group roles, you can use this helper
   *       to check for permissions in the Roles.GLOBAL_GROUP but to 
   *       check for permissions in a specific group you will need to 
   *       use Roles.userIsInRole() from your own template helper.
   *
   * @example
   *     {{#if isInRole 'admin'}}
   *     {{/if}}
   *
   *     {{#if isInRole 'editor,user'}}
   *     {{/if}}
   *
   * @method isInRole
   * @param {String} role name of role or comma-seperated list of roles
   * @return {Boolean} true if current user is in at least one of the target roles
   */
  isInRole: function (role, group) {
    var user = Meteor.user(),
        comma = role && role.indexOf(','),
        roles

    if (!user) return false

    if (comma !== -1) {
      roles = _.reduce(role.split(','), function (memo, r) {
        if (!r || !r.trim()) {
          return memo
        }
        memo.push(r.trim())
        return memo
      }, [])
    } else {
      roles = [role]
    }

    if (Match.test(group, String))
      return Roles.userIsInRole(user, roles, group)
    else
      return Roles.userIsInRole(user, roles)
  }
}


if ('undefined' !== typeof Handlebars) {
  _.each(Roles._handlebarsHelpers, function (func, name) {
    Handlebars.registerHelper(name, func)
  })
} else {
  console.log('WARNING: Roles Handlebars helpers not registered. Handlebars not defined')
}

}());
