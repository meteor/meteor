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
 * <p>Role-based authorization compatible with built-in Meteor accounts package.</p>
 * <br />
 * <p>Uses 'roles' collection to store existing roles with unique index on 'name' field.</p>
 * <p>Adds a 'roles' field to user objects in 'users' collection when they are added to a given role.</p>
 *
 * @class Roles
 * @constructor
 */
if ('undefined' === typeof Roles) {
  Roles = {}
}

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
    id = Meteor.roles.insert({'name':role.trim()})
    return id
  } catch (e) {
    // (from Meteor accounts-base package, insertUserDoc func)
    // XXX string parsing sucks, maybe
    // https://jira.mongodb.org/browse/SERVER-3069 will get fixed one day
    if (e.name !== 'MongoError') throw e
    match = e.err.match(/^E11000 duplicate key error index: ([^ ]+)/);
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
  if (!role) {
    return
  }

  var foundExistingUser = Meteor.users.findOne({roles: {$in: [role]}}, {_id: 1})

  if (foundExistingUser) {
    throw new Meteor.Error(403, 'Role in use')
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

  var existingRoles

  // ensure arrays
  if (!_.isArray(users)) users = [users]
  if (!_.isArray(roles)) roles = [roles]

  // remove invalid roles
  roles = _.reduce(roles, function (memo, role) {
    if (role &&
        'string' === typeof role &&
        role.trim().length > 0) {
      memo.push(role.trim())
    }
    return memo
  }, [])

  if (roles.length === 0) {
    return
  }

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
  if (Meteor.isClient) {
    _.each(users, function (user) {
      // Iterate over each user to fulfill Meteor's 'one update per ID' policy
      Meteor.users.update(
        {       _id: user },
        { $addToSet: { roles: { $each: roles } } },
        {     multi: true }
      )
    })
  } else {
    // On the server we can leverage MongoDB's $in operator for performance
    Meteor.users.update(
      {       _id: { $in: users } },
      { $addToSet: { roles: { $each: roles } } },
      {     multi: true }
    )
  }
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
  if (Meteor.isClient) {
    // Iterate over each user to fulfill Meteor's 'one update per ID' policy
    _.each(users, function (user) {
      Meteor.users.update(
        {      _id: user },
        { $pullAll: { roles: roles } },
        {    multi: true}
      )
    })
  } else {
    // On the server we can leverage MongoDB's $in operator for performance
    Meteor.users.update(
      {      _id: {   $in: users } },
      { $pullAll: { roles: roles } },
      {    multi: true}
    )
  }
}

/**
 * Check if user is in role
 *
 * @method userIsInRole
 * @param {String|Object} user Id of user or actual user object
 * @param {String|Array} roles Name of role or Array of roles to check against.  If array, will return true if user is in _any_ role.
 * @return {Boolean} true if user is in _any_ of the target roles
 */
Roles.userIsInRole = function (user, roles) {
  var id,
      userRoles
    
  // ensure array to simplify code
  if (!_.isArray(roles)) {
    roles = [roles]
  }
  
  if (!user) {
    return false
  } else if ('object' === typeof user) {
    userRoles = user.roles
    if (_.isArray(userRoles)) {
      return _.some(roles, function (role) {
        return _.contains(userRoles, role)
      })
    }
    // missing roles field, try going direct via id
    id = user._id
  } else if ('string' === typeof user) {
    id = user
  } 

  if (!id) return false

  return Meteor.users.findOne(
    { _id: id, roles: { $in: roles } },
    { _id: 1 }
  )
}

/**
 * Retrieve users roles
 *
 * @method getRolesForUser
 * @param {String} user Id of user
 * @return {Array} Array of user's roles, unsorted
 */
Roles.getRolesForUser = function (user) {
  var user = Meteor.users.findOne(
    { _id: user},
    { _id: 0, roles: 1}
  )
  
  return user ? user.roles : undefined
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
