;(function () {

/**
 * Provides functions related to user authorization. Compatible with built-in Meteor accounts packages.
 *
 * @module Roles
 */

/**
 * Roles collection documents consist only of an id and a role name.
 *   ex: { _id:<uuid>, name: "admin" }
 */
Meteor.roles = new Meteor.Collection("roles")


/**
 * <p>Role-based authorization compatible with built-in Meteor accounts package.</p>
 * <br />
 * <p>Uses 'roles' collection to store existing roles.</p>
 * <p>Adds a 'roles' field to user objects in 'users' collection when they are added to a given role.</p>
 *
 * @class Roles
 * @constructor
 */
if ('undefined' === typeof Roles) {
  Roles = {}
}

/**
 * Create a new role
 *
 * @method createRole
 * @param {String} role Name of role
 */
Roles.createRole = function (role) {
  if (!role 
      || 'string' !== typeof role 
      || role.trim().length === 0) {
    return
  }

  Meteor.roles.insert({'name':role})
}

/** 
 * Delete an existing role.  Will throw "Role in use" error if any users 
 * are currently assigned to the target role.
 * 
 * @method deleteRole
 * @param {String} role Name of role
 */
Roles.deleteRole = function (role) {
  if (!role) {
    return
  }

  var foundExistingUser = Meteor.users.findOne(
        { roles: { $in: [role] } },
        {   _id: 1 }
      )

  if (foundExistingUser) {
    throw new Error('Role in use')
  }

  Meteor.roles.remove({ name: role })
}

/**
 * Add users to roles. Will create roles as needed.
 *
 * Makes 2 calls to database:
 *  1. retrieve list of all existing roles
 *  2. update users' roles
 *
 * @method addUsersToRoles
 * @param {Array|String} users id(s) of users to add to roles
 * @param {Array|String} roles name(s) of roles to add users to
 */
Roles.addUsersToRoles = function (users, roles) {
  if (!users) throw new Error ("Missing 'users' param")
  if (!roles) throw new Error ("Missing 'roles' param")

  var temp

  // ensure arrays
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  // ensure all roles exist in 'roles' collection
  temp = _.difference(roles, Meteor.roles.find())
  _.each(temp, function (role) {
    Roles.createRole(role)
  })

  // update all users, adding to roles set
  Meteor.users.update(
    {       _id: { $in: users } },
    { $addToSet: { roles: { $each: roles } } },
    {     multi: true }
  )
}

/**
 * Remove users from roles
 *
 * @method removeUsersFromRoles
 * @param {Array|String} users id(s) of users to add to roles
 * @param {Array|String} roles name(s) of roles to add users to
 */
Roles.removeUsersFromRoles = function (users, roles) {
  if (!users) throw new Error ("Missing 'users' param")
  if (!roles) throw new Error ("Missing 'roles' param")

  // ensure arrays
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  // update all users, remove from roles set
  Meteor.users.update(
    {      _id: {   $in: users } },
    { $pullAll: { roles: roles } },
    {    multi: true}
  )
}

/**
 * Check if user is in role
 *
 * @method userIsInRole
 * @param {String} user Id of user
 * @param {String} role Name of role
 */
Roles.isUserInRole = function (user, role) {
  var found = Meteor.users.findOne(
      { _id: user, roles: { $in: [role] } },
      { _id: 1 }
    )

  return found
}

/**
 * Retrieve users roles
 *
 * @method getRolesForUser
 * @param {String} user Id of user
 * @return {Array} array of roles for user
 */
Roles.getRolesForUser = function (user) {
  return Meteor.users.findOne(
    { _id: user},
    { _id: 0, roles: 1}
  ).roles
}

/**
 * Retrieve all existing roles
 *
 * @method getAllRoles
 * @return {Cursor} cursor of existing roles
 */
Roles.getAllRoles = function () {
  return Meteor.roles.find({}, { sort: { name: 1 } })
}

/**
 * Retrieve all users who are in target role
 *
 * @method getUsersInRole
 * @param {String} role Name of role
 * @return {Cursor} cursor of users in role
 */
Roles.getUsersInRole = function (role) {
  return Meteor.users.find(
    { roles: { $in: [role] } }
  )
}

}());
