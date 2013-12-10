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
if (!Meteor.roles) {
  Meteor.roles = new Meteor.Collection("roles")
}

/**
 * Role-based authorization compatible with built-in Meteor accounts package.
 *
 * Uses 'roles' collection to store existing roles with unique index on 'name' field.
 * Adds a 'roles' field to user objects in 'users' collection when they are added to a given role.
 *
 * @class Roles
 * @constructor
 */
if ('undefined' === typeof Roles) {
  Roles = {}
}

"use strict";

var mixingGroupAndNonGroupErrorMsg = "Roles error: Can't mix grouped and non-grouped roles for same user";


/**
 * Create a new role. Whitespace will be trimmed.
 *
 * @method createRole
 * @param {String} role Name of role
 * @return {String} id of new role
 */
Roles.createRole = function (role) {
  var id,
      match

  if (!role
      || 'string' !== typeof role
      || role.trim().length === 0) {
    return
  }

  try {
    id = Meteor.roles.insert({'name': role.trim()})
    return id
  } catch (e) {
    // (from Meteor accounts-base package, insertUserDoc func)
    // XXX string parsing sucks, maybe
    // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
    if (e.name !== 'MongoError') throw e
    match = e.err.match(/^E11000 duplicate key error index: ([^ ]+)/)
    if (!match) throw e
    if (match[1].indexOf('$name') !== -1)
      throw new Meteor.Error(403, "Role already exists.")
    throw e
  }
}

/**
 * Delete an existing role.  Will throw "Role in use" error if any users
 * are currently assigned to the target role.
 *
 * @method deleteRole
 * @param {String} role Name of role
 */
Roles.deleteRole = function (role) {
  if (!role) return

  var foundExistingUser = Meteor.users.findOne(
                            {roles: {$in: [role]}},
                            {fields: {_id: 1}})

  if (foundExistingUser) {
    throw new Meteor.Error(403, 'Role in use')
  }

  var thisRole = Meteor.roles.findOne({name: role})
  if (thisRole) {
    Meteor.roles.remove({_id: thisRole._id})
  }
}

/**
 * Add users to roles. Will create roles as needed.
 *
 * NOTE: Mixing grouped and non-grouped roles for the same user
 *       is not supported and will throw an error.
 *
 * Makes 2 calls to database:
 *  1. retrieve list of all existing roles
 *  2. update users' roles
 *
 * @example
 *     Roles.addUsersToRoles(userId, 'admin')
 *     Roles.addUsersToRoles(userId, ['user','editor'])
 *     Roles.addUsersToRoles(userId, ['view-secrets'], 'example.com')
 *     Roles.addUsersToRoles(userId, ['perform-action'], 'example.org')
 *     Roles.addUsersToRoles(userId, 'admin', '_global')
 *
 * @method addUsersToRoles
 * @param {Array|String} users id(s) of users to add to roles
 * @param {Array|String} roles name(s) of roles/permissions to add users to
 * @param {String} [group] Optional group name. If supplied, roles will be
 *                         specific to that group.  
 *                         The group name '_global' is special and provides a 
 *                         convenient way to assign blanket roles/permissions
 *                         across all groups.  The roles/permissions in the 
 *                         '_global' group will be automatically included in 
 *                         checks for any group.
 */
Roles.addUsersToRoles = function (users, roles, group) {
  if (!users) throw new Error ("Missing 'users' param")
  if (!roles) throw new Error ("Missing 'roles' param")
  if (group && 'string' !== typeof group)
    throw new Error ("Invalid parameter 'group'. Expected 'string' type")

  var existingRoles,
      query,
      update

  // ensure arrays
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  // remove invalid roles
  roles = _.reduce(roles, function (memo, role) {
    if (role
        && 'string' === typeof role
        && role.trim().length > 0) {
      memo.push(role.trim())
    }
    return memo
  }, [])

  if (roles.length === 0)
    return

  // ensure all roles exist in 'roles' collection
  existingRoles = _.reduce(Meteor.roles.find({}).fetch(), function (memo, role) {
    memo[role.name] = true
    return memo
  }, {})
  _.each(roles, function (role) {
    if (!existingRoles[role]) {
      Roles.createRole(role)
    }
  })

  // update all users, adding to roles set
  
  if (group) {
    // roles is a key/value dict object
    update = {$addToSet: {}}
    update.$addToSet['roles.' + group] = {$each: roles}
  } else {
    // assume roles is an array of strings
    update = {$addToSet: {roles: {$each: roles}}}
  }

  try {
    if (Meteor.isClient) {
      // On client, iterate over each user to fulfill Meteor's 
      // 'one update per ID' policy
      _.each(users, function (user) {
        Meteor.users.update({_id: user}, update)
      })
    } else {
      // On the server we can use MongoDB's $in operator for 
      // better performance
      Meteor.users.update(
        {_id: {$in: users}},
        update,
        {multi: true})
    }
  }
  catch (ex) {
    var addNonGroupToGroupedRolesMsg = 'Cannot apply $addToSet modifier to non-array',
        addGrouped2NonGroupedMsg = "can't append to array using string field name"

    if (ex.name === 'MongoError' &&
        (ex.err === addNonGroupToGroupedRolesMsg ||
         ex.err.substring(0, 45) === addGrouped2NonGroupedMsg)) {
      throw new Error (mixingGroupAndNonGroupErrorMsg)
    }

    throw ex
  }
}

/**
 * Remove users from roles
 *
 * @method removeUsersFromRoles
 * @param {Array|String} users id(s) of users to add to roles
 * @param {Array|String} roles name(s) of roles to add users to
 * @param {String} [group] Optional. Group name. If supplied, only that
 *                         group will have roles removed.
 */
Roles.removeUsersFromRoles = function (users, roles, group) {
  var update

  if (!users) throw new Error ("Missing 'users' param")
  if (!roles) throw new Error ("Missing 'roles' param")
  if (group && 'string' !== typeof group) 
    throw new Error ("Invalid 'group' param")

  // ensure arrays
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  if (group) {
    update = {$pullAll: {}}
    update.$pullAll['roles.'+group] = roles
  } else {
    update = {$pullAll: {roles: roles}}
  }

  // update all users, remove from roles set
  
  try {
    if (Meteor.isClient) {
      // Iterate over each user to fulfill Meteor's 'one update per ID' policy
      _.each(users, function (user) {
        Meteor.users.update({_id:user}, update)
      })
    } else {
      // On the server we can leverage MongoDB's $in operator for performance
      Meteor.users.update({_id:{$in:users}}, update, {multi: true})
    }
  }
  catch (ex) {
    var removeNonGroupedRoleFromGroupMsg = 'Cannot apply $pull/$pullAll modifier to non-array' 

    if (ex.name === 'MongoError' &&
        ex.err === removeNonGroupedRoleFromGroupMsg) {
      throw new Error (mixingGroupAndNonGroupErrorMsg)
    }

    throw ex
  }
}

/**
 * Check if user has specified permissions/roles
 *
 * @method userIsInRole
 * @param {String|Object} user Id of user or actual user object
 * @param {String|Array} roles Name of role/permission or Array of roles/permissions to check against.  If array, will return true if user is in _any_ role.
 * @param {String} [group] Optional. Name of group.  If supplied, limits check
 *                         to just that group & the user's '_global' group, if 
 *                         any.
 * @return {Boolean} true if user is in _any_ of the target roles
 */
Roles.userIsInRole = function (user, roles, group) {
  var id,
      userRoles,
      query,
      groupQuery,
      found = false

  // ensure array to simplify code
  if (!_.isArray(roles)) {
    roles = [roles]
  }

  if (!user) return false
  if (group && 'string' !== typeof group) return false
  
  if ('object' === typeof user) {
    userRoles = user.roles
    if (_.isArray(userRoles)) {
      return _.some(roles, function (role) {
        return _.contains(userRoles, role)
      })
    } else if ('object' === typeof userRoles) {
      // roles field is dictionary of groups
      found = _.isArray(userRoles[group]) && _.some(roles, function (role) {
        return _.contains(userRoles[group], role)
      })
      if (!found) {
        // not found in regular group.  check '_global' group, if it exists
        found = _.isArray(userRoles._global) && _.some(roles, function (role) {
          return _.contains(userRoles[group], role)
        })
      }
      return found
    }

    // missing roles field, try going direct via id
    id = user._id
  } else if ('string' === typeof user) {
    id = user
  }

  if (!id) return false

  if (group) {
    // structure of group query, including _global
    //   {_id: id, 
    //    $or: [
    //      {'roles.group1':{$in: ['admin']}},
    //      {'roles._global':{$in: ['admin']}}
    //    ]}
    
    groupQuery = {}
    groupQuery['roles.'+group] = {$in: roles}

    query = {_id: id, $or: []}
    query.$or.push(groupQuery)
    query.$or.push({'roles._global': {$in: roles}})
  } else {
    query = {_id: id, roles: {$in: roles}}
  }

  found = Meteor.users.findOne(query, {fields: {_id: 1}})
  return found ? true : false
}

/**
 * Retrieve users roles
 *
 * @method getRolesForUser
 * @param {String} user Id of user
 * @param {String} [group] Optional name of group to restrict roles to.
 *                         '_global' group will also be checked.
 * @return {Array} Array of user's roles, unsorted. undefined if user not found
 */
Roles.getRolesForUser = function (user, group) {
  var user

  if (!user) return
  if (group && 'string' !== typeof group) return

  user = Meteor.users.findOne(
           {_id: user},
           {fields: {roles: 1}})

  if (!user || !user.roles) return

  if (group)
    return _.union(user.roles[group], user.roles._global || [])

  return user.roles
}

/**
 * Retrieve all existing roles
 *
 * @method getAllRoles
 * @return {Cursor} cursor of existing roles
 */
Roles.getAllRoles = function () {
  return Meteor.roles.find({}, {sort: {name: 1}})
}

/**
 * Retrieve all users who are in target role
 *
 * @method getUsersInRole
 * @param {Array|String} role Name of role/permission.  If array, users 
 *                            returned will have at least one of the roles
 *                            specified but need not have _all_ roles.
 * @param {String} [group] Optional name of group to restrict roles to
 *                         '_global' group will also be checked.
 * @return {Cursor} cursor of users in role
 */
Roles.getUsersInRole = function (role, group) {
  var query,
      roles = role,
      groupQuery

  // ensure array to simplify query logic
  if (!_.isArray(roles)) roles = [roles]
  
  if (group) {
    // structure of group query, including _global
    //   {$or: [
    //      {'roles.group1':{$in: ['admin']}},
    //      {'roles._global':{$in: ['admin']}}
    //    ]}
    groupQuery = {}
    groupQuery['roles.'+group] = {$in: roles}

    query = {$or: []}
    query.$or.push(groupQuery)
    query.$or.push({'roles._global': {$in: roles}})
  } else {
    query = { roles: { $in: roles } }
  }

  return Meteor.users.find(query)
}

}());
